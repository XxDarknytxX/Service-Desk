// src/middleware/workspace.js
//
// The Service Desk is two applications sharing one backend:
//
//   corporate — corporate customers raise requests by service category; NOC
//               triages; delivery queues (Cloud, Transmission, MTX, Security
//               Ops) and Service Delivery action them.
//   internal  — the Vodafone-internal service desk: templates, approvals,
//               assets, forms, departments, hierarchy, reports.
//
// Separation is enforced HERE, on the server. The frontend's two route trees
// are presentation only — every guard below holds even for a hand-crafted
// request.
//
// Access is derived, never stored, so it can't drift from team membership:
//   admin                               → both (and can switch views)
//   corporate_customer                  → corporate, as a customer
//   member of any team with workspace   → corporate, as staff
//     = 'corporate'
//   everyone else                       → internal
//
// A staff member in both a corporate and an internal team is treated as
// corporate — only admins and members of the corporate Executive team
// (corporate_role = 'executive') get both apps.

export const WORKSPACES = ["internal", "corporate"];

let wsPool = null;

/** Called once from server.js. */
export function setWorkspacePool(pool) {
  wsPool = pool;
}

/**
 * Pure access calculation for a user. Exported so login / auth/me can tell the
 * frontend which apps a user has without going through a request.
 */
export async function computeWorkspaceAccess(pool, userId, roles = []) {
  const isAdmin = roles.includes("admin");
  const isCustomer = roles.includes("corporate_customer");

  let inCorporateTeam = false;
  let isExecutive = false;
  if (!isAdmin && !isCustomer) {
    const [[row]] = await pool.query(
      `SELECT
         EXISTS(SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
                 WHERE tm.user_id = ? AND t.workspace = 'corporate') AS c,
         EXISTS(SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
                 WHERE tm.user_id = ? AND t.corporate_role = 'executive') AS e`,
      [userId, userId]
    );
    inCorporateTeam = !!row.c;
    isExecutive = !!row.e;
  }

  // Executives sit at the top of the corporate escalation chain but also run
  // the internal side of the business, so — like admins — they get both apps.
  const workspaces = isAdmin || isExecutive
    ? ["internal", "corporate"]
    : isCustomer || inCorporateTeam
      ? ["corporate"]
      : ["internal"];

  return {
    isAdmin,
    isCustomer,
    isExecutive,
    // Staff who work corporate tickets (admins and executives included).
    isCorporateStaff: !isCustomer && (isAdmin || inCorporateTeam),
    workspaces,
    home: workspaces[0],
  };
}

/** Memoised per request. */
export async function getWorkspaceAccess(req) {
  if (req._workspaceAccess) return req._workspaceAccess;
  req._workspaceAccess = await computeWorkspaceAccess(wsPool, req.user.id, req.user.roles || []);
  return req._workspaceAccess;
}

export function canAccessWorkspace(access, workspace) {
  return access.workspaces.includes(workspace);
}

/**
 * The workspace a request is acting in: an explicit ?workspace= / body
 * `workspace` if given, else the user's home app. Throws a 403-shaped error if
 * the user may not use that workspace, so handlers can `catch` uniformly.
 */
export async function resolveRequestWorkspace(req, explicit) {
  const access = await getWorkspaceAccess(req);
  // Precedence: explicit argument, ?workspace=, body, then the X-Workspace header
  // the frontend's API layer sends for the app currently on screen. The header
  // is only a PREFERENCE — access is checked below either way.
  const asked = explicit ?? req.query?.workspace ?? req.body?.workspace ?? req.headers?.["x-workspace"];
  const workspace = asked ? String(asked) : access.home;
  if (!WORKSPACES.includes(workspace)) {
    const err = new Error("Unknown workspace");
    err.status = 400;
    throw err;
  }
  if (!canAccessWorkspace(access, workspace)) {
    const err = new Error("You don't have access to this workspace");
    err.status = 403;
    throw err;
  }
  return { workspace, access };
}

/** Route guard: only users with access to `workspace` get past. */
export function requireWorkspace(workspace) {
  return (req, res, next) => {
    getWorkspaceAccess(req)
      .then((access) => {
        if (!canAccessWorkspace(access, workspace)) {
          return res.status(403).json({
            error: workspace === "internal"
              ? "This area is part of the internal service desk"
              : "This area is part of the corporate service desk",
          });
        }
        next();
      })
      .catch((err) => {
        console.error("[Workspace] access check failed:", err.message);
        res.status(503).json({ error: "Access check temporarily unavailable" });
      });
  };
}

/** Route guard: staff only (admin or agent) — never customers or plain requesters. */
export function requireStaff(req, res, next) {
  const roles = req.user?.roles || [];
  if (roles.includes("admin") || roles.includes("agent")) return next();
  return res.status(403).json({ error: "Forbidden" });
}

/**
 * Router.param handler for any route carrying a ticket id: the ticket's
 * workspace must be one the caller can use. Missing tickets fall through so the
 * handler returns its own 404.
 */
export async function ticketWorkspaceParam(req, res, next, rawId) {
  const ticketId = Number(rawId);
  if (!Number.isInteger(ticketId) || ticketId <= 0) return next();
  try {
    const [[row]] = await wsPool.query("SELECT workspace FROM tickets WHERE id = ?", [ticketId]);
    if (!row) return next();
    const access = await getWorkspaceAccess(req);
    if (!canAccessWorkspace(access, row.workspace)) {
      return res.status(403).json({ error: "You don't have access to this ticket" });
    }
    req.ticketWorkspace = row.workspace;
    next();
  } catch (err) {
    console.error("[Workspace] ticket check failed:", err.message);
    res.status(503).json({ error: "Access check temporarily unavailable" });
  }
}

// ── Corporate team lookups (replace name / title conventions) ─────────────

export async function getTriageTeamId(pool) {
  const [[row]] = await pool.query(
    "SELECT id FROM teams WHERE corporate_role = 'triage' ORDER BY id LIMIT 1"
  );
  return row?.id || null;
}

export async function isTriageMember(pool, userId) {
  const [[row]] = await pool.query(
    `SELECT 1 AS ok FROM team_members tm JOIN teams t ON t.id = tm.team_id
      WHERE t.corporate_role = 'triage' AND tm.user_id = ? LIMIT 1`,
    [userId]
  );
  return !!row;
}

/** Ids of corporate delivery queues a triaged ticket may be routed to. */
export async function getCorporateQueueTeamIds(pool) {
  const [rows] = await pool.query(
    "SELECT id FROM teams WHERE workspace = 'corporate' AND corporate_role = 'queue'"
  );
  return rows.map((r) => r.id);
}

/** Is this user a member of a Service Delivery team (SDM / SDE)? */
export async function isServiceDeliveryMember(pool, userId) {
  const [[row]] = await pool.query(
    `SELECT 1 AS ok FROM team_members tm JOIN teams t ON t.id = tm.team_id
      WHERE t.corporate_role = 'service_delivery' AND tm.user_id = ? LIMIT 1`,
    [userId]
  );
  return !!row;
}

/** Active members of Service Delivery teams (replaces title = 'Service Delivery Manager'). */
export async function getServiceDeliveryUserIds(pool, excludeUserId = null) {
  const [rows] = await pool.query(
    `SELECT DISTINCT tm.user_id FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       JOIN users u ON u.id = tm.user_id
      WHERE t.corporate_role = 'service_delivery' AND u.is_active = 1
        AND (? IS NULL OR tm.user_id <> ?)`,
    [excludeUserId, excludeUserId]
  );
  return rows.map((r) => r.user_id);
}
