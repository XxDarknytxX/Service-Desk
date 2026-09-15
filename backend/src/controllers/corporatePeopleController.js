// src/controllers/corporatePeopleController.js
//
// People management for the CORPORATE service desk. Deliberately separate from
// the internal Users API: the corporate side has no requester/agent model.
// It has two kinds of people:
//
//   Customers       corporate_customer accounts that raise requests.
//   Delivery staff  members of corporate teams. Their POSITION comes from the
//                   team they sit in (its corporate_role) and whether they lead
//                   it — a delivery queue has Engineers and a Manager, NOC has
//                   Triage Engineers and a Triage Manager, Service Delivery has
//                   Executives and a Manager. Underneath they are plain `agent`
//                   accounts; the team is what places them in the flow.
//
// Reporting lines (who each person answers to) form the corporate hierarchy,
// which is also the escalation / approval ladder for requests: L1 = direct
// manager, L2 = their manager, and so on. It is self-contained — managers must
// be corporate staff.
//
// New accounts can be sent an onboarding email to set their own password
// (default), or be given a password by an admin. Either way nobody but the
// person ever sees a working password.
//
// Who may do what:
//   admin              everything
//   Service Delivery   customers only: create, edit, (de)activate, resend
//                      onboarding, send password reset
//   other corp. staff  read-only
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { setUserRoles } from "../utils/roles.js";
import { forgetSession } from "../middleware/auth.js";
import { isServiceDeliveryMember } from "../middleware/workspace.js";
import { sendOnboarding, sendAdminReset, validateNewPassword } from "../services/passwordResetService.js";
import { setDirectManager, wouldCreateCycle } from "../services/hierarchyService.js";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  forbidden: (res, msg = "Forbidden") => res.status(403).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const POSITION_LABELS = {
  queue: ["Delivery Engineer", "Delivery Manager"],
  triage: ["Triage Engineer (NOC)", "Triage Manager (NOC)"],
  service_delivery: ["Service Delivery Executive", "Service Delivery Manager"],
  // The executive layer (CTO, CEO, heads of business) — tops the escalation chain.
  executive: ["Executive", "Executive"],
};

const isAdmin = (req) => (req.user.roles || []).includes("admin");
const clean = (v) => (typeof v === "string" ? v.trim() : v);

async function isCorporateCustomer(pool, userId) {
  const [[row]] = await pool.query(
    `SELECT 1 AS yes FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'corporate_customer' LIMIT 1`,
    [userId]
  );
  return !!row;
}

async function isCorporateStaff(pool, userId) {
  const [[row]] = await pool.query(
    `SELECT 1 AS yes FROM team_members tm JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ? AND t.workspace = 'corporate' LIMIT 1`,
    [userId]
  );
  return !!row && !(await isCorporateCustomer(pool, userId));
}

/** What kind of corporate person this is, or null if they aren't one. */
async function corporateKind(pool, userId) {
  if (await isCorporateCustomer(pool, userId)) return "customer";
  if (await isCorporateStaff(pool, userId)) return "staff";
  return null;
}

/** May the caller manage this kind of person? */
async function canManage(pool, req, kind) {
  if (isAdmin(req)) return true;
  return kind === "customer" && (await isServiceDeliveryMember(pool, req.user.id));
}

/** A password nobody knows — used until an onboarded user chooses their own. */
async function unusablePasswordHash() {
  return bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 10);
}

/**
 * Builds everyone's corporate reporting position from the level-1 links, in
 * memory: direct manager (if corporate), the manager outside Corporate where
 * the chain crosses the boundary, their org level (1 = top of the corporate
 * chart) and how many people report to them.
 */
async function loadCorporateStructure(pool) {
  const [staff] = await pool.query(
    `SELECT u.id, u.full_name, u.title FROM users u
      WHERE EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
                     WHERE tm.user_id = u.id AND t.workspace = 'corporate')
        AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                         WHERE ur.user_id = u.id AND r.name = 'corporate_customer')`
  );
  const staffIds = new Set(staff.map((s) => s.id));
  const [links] = await pool.query(
    `SELECT h.user_id, h.manager_id, m.full_name AS manager_name, m.title AS manager_title
       FROM user_hierarchy h JOIN users m ON m.id = h.manager_id
      WHERE h.level = 1 AND h.is_active = 1`
  );
  const managerOf = new Map(links.map((l) => [l.user_id, l]));

  const info = new Map();
  for (const s of staff) {
    const link = managerOf.get(s.id);
    const corporateManager = link && staffIds.has(link.manager_id) ? link.manager_id : null;
    const outsideManager = link && !staffIds.has(link.manager_id)
      ? { id: link.manager_id, full_name: link.manager_name, title: link.manager_title }
      : null;
    info.set(s.id, { manager_id: corporateManager, outside_manager: outsideManager });
  }
  // Org level = corporate managers above + 1 (loop-safe).
  for (const s of staff) {
    let level = 1;
    let cur = info.get(s.id).manager_id;
    const seen = new Set([s.id]);
    while (cur && !seen.has(cur) && level < 20) {
      seen.add(cur);
      level++;
      cur = info.get(cur)?.manager_id || null;
    }
    info.get(s.id).org_level = level;
  }
  const reports = {};
  for (const [, v] of info) if (v.manager_id) reports[v.manager_id] = (reports[v.manager_id] || 0) + 1;
  for (const [id, v] of info) v.report_count = reports[id] || 0;
  return info;
}

async function loadPositions(pool, userIds) {
  if (!userIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT tm.user_id, tm.is_lead, t.id AS team_id, t.name AS team_name, t.corporate_role
       FROM team_members tm JOIN teams t ON t.id = tm.team_id
      WHERE t.workspace = 'corporate' AND tm.user_id IN (?)
      ORDER BY tm.is_lead DESC, t.name`,
    [userIds]
  );
  const byUser = new Map();
  for (const r of rows) {
    const labels = POSITION_LABELS[r.corporate_role] || ["Team Member", "Team Manager"];
    const list = byUser.get(r.user_id) || [];
    list.push({
      team_id: r.team_id,
      team_name: r.team_name,
      corporate_role: r.corporate_role,
      is_lead: !!r.is_lead,
      label: labels[r.is_lead ? 1 : 0],
    });
    byUser.set(r.user_id, list);
  }
  return byUser;
}

export function makeCorporatePeopleController(pool) {
  return {
    // GET /api/corporate/people?type=customers|staff
    list: async (req, res) => {
      const type = req.query.type === "staff" ? "staff" : "customers";
      try {
        const where = type === "customers"
          ? `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                      WHERE ur.user_id = u.id AND r.name = 'corporate_customer')`
          : `EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
                      WHERE tm.user_id = u.id AND t.workspace = 'corporate')
             AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                              WHERE ur.user_id = u.id AND r.name = 'corporate_customer')`;
        const [rows] = await pool.query(
          `SELECT u.id, u.email, u.full_name, u.title, u.company, u.phone, u.is_active,
                  u.must_set_password, u.last_login_at, u.created_at,
                  (SELECT MAX(prt.expires_at) FROM password_reset_tokens prt
                    WHERE prt.user_id = u.id AND prt.purpose = 'onboarding' AND prt.used_at IS NULL) AS invite_expires_at
             FROM users u
            WHERE ${where}
            ORDER BY u.full_name`
        );

        const [[caps]] = [[{
          can_manage_customers: isAdmin(req) || (await isServiceDeliveryMember(pool, req.user.id)),
          can_manage_staff: isAdmin(req),
        }]];

        if (type === "customers") {
          return send.ok(res, {
            items: rows.map((r) => ({
              ...r,
              kind: "customer",
              must_set_password: !!r.must_set_password,
              onboarding_status: r.must_set_password ? "invited" : "active",
            })),
            ...caps,
          });
        }

        const structure = await loadCorporateStructure(pool);
        const positions = await loadPositions(pool, rows.map((r) => r.id));
        const nameOf = new Map(rows.map((r) => [r.id, r.full_name]));
        return send.ok(res, {
          items: rows.map((r) => {
            const s = structure.get(r.id) || {};
            return {
              ...r,
              kind: "staff",
              must_set_password: !!r.must_set_password,
              onboarding_status: r.must_set_password ? "invited" : "active",
              positions: positions.get(r.id) || [],
              manager_id: s.manager_id || null,
              manager_name: s.manager_id ? nameOf.get(s.manager_id) || null : null,
              outside_manager: s.outside_manager || null,
              org_level: s.org_level || 1,
              report_count: s.report_count || 0,
            };
          }),
          ...caps,
        });
      } catch (e) {
        console.error("corporate people list error:", e);
        return send.serverErr(res);
      }
    },

    // POST /api/corporate/people/customers
    createCustomer: async (req, res) => {
      if (!(await canManage(pool, req, "customer"))) {
        return send.forbidden(res, "Only administrators and Service Delivery can add customers.");
      }
      const full_name = clean(req.body.full_name);
      const email = clean(req.body.email)?.toLowerCase();
      const company = clean(req.body.company);
      const sendInvite = req.body.send_onboarding !== false;

      if (!full_name || full_name.length < 2) return send.bad(res, "Full name is required");
      if (!email || !EMAIL_RE.test(email)) return send.bad(res, "A valid email is required");
      if (!company) return send.bad(res, "Company is required for corporate customers");
      if (!sendInvite) {
        const problem = validateNewPassword(req.body.password);
        if (problem) return send.bad(res, problem);
      }

      try {
        const [[dupe]] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
        if (dupe) return send.bad(res, "An account with this email already exists");

        const hash = sendInvite ? await unusablePasswordHash() : await bcrypt.hash(req.body.password, 10);
        const [ins] = await pool.query(
          `INSERT INTO users (email, password_hash, must_set_password, full_name, title, company, phone, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [email, hash, sendInvite ? 1 : 0, full_name, clean(req.body.title) || null, company, clean(req.body.phone) || null]
        );
        await setUserRoles(pool, ins.insertId, ["corporate_customer"]);

        const onboarding = sendInvite
          ? await sendOnboarding(pool, { userId: ins.insertId, actorId: req.user.id, requestIp: req.ip })
          : null;

        return send.created(res, {
          id: ins.insertId,
          email,
          onboarding: onboarding
            ? { requested: true, sent: onboarding.ok, error: onboarding.ok ? null : onboarding.error }
            : { requested: false },
        });
      } catch (e) {
        console.error("create corporate customer error:", e);
        return send.serverErr(res);
      }
    },

    // POST /api/corporate/people/staff
    createStaff: async (req, res) => {
      if (!isAdmin(req)) return send.forbidden(res, "Only administrators can add delivery staff.");
      const full_name = clean(req.body.full_name);
      const email = clean(req.body.email)?.toLowerCase();
      const teamId = Number(req.body.team_id);
      const isLead = !!req.body.is_lead;
      const managerId = req.body.manager_id ? Number(req.body.manager_id) : null;
      const sendInvite = req.body.send_onboarding !== false;

      if (!full_name || full_name.length < 2) return send.bad(res, "Full name is required");
      if (!email || !EMAIL_RE.test(email)) return send.bad(res, "A valid email is required");
      if (!teamId) return send.bad(res, "Choose the team this person works in");
      if (!sendInvite) {
        const problem = validateNewPassword(req.body.password);
        if (problem) return send.bad(res, problem);
      }

      try {
        const [[team]] = await pool.query("SELECT id, name, workspace FROM teams WHERE id = ?", [teamId]);
        if (!team || team.workspace !== "corporate") return send.bad(res, "Choose a corporate team");
        if (isLead) {
          const [[lead]] = await pool.query(
            `SELECT u.full_name FROM team_members tm JOIN users u ON u.id = tm.user_id
              WHERE tm.team_id = ? AND tm.is_lead = 1 LIMIT 1`,
            [teamId]
          );
          if (lead) return send.bad(res, `${team.name} already has a manager (${lead.full_name}). Change their position first.`);
        }
        if (managerId && !(await isCorporateStaff(pool, managerId))) {
          return send.bad(res, "A reporting manager must be corporate staff.");
        }
        const [[dupe]] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
        if (dupe) return send.bad(res, "An account with this email already exists");

        const hash = sendInvite ? await unusablePasswordHash() : await bcrypt.hash(req.body.password, 10);
        const conn = await pool.getConnection();
        let userId;
        try {
          await conn.beginTransaction();
          const [ins] = await conn.query(
            `INSERT INTO users (email, password_hash, must_set_password, full_name, title, phone, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [email, hash, sendInvite ? 1 : 0, full_name, clean(req.body.title) || null, clean(req.body.phone) || null]
          );
          userId = ins.insertId;
          await conn.query(
            `INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = 'agent'`,
            [userId]
          );
          await conn.query(
            "INSERT INTO team_members (team_id, user_id, is_lead) VALUES (?, ?, ?)",
            [teamId, userId, isLead ? 1 : 0]
          );
          await conn.commit();
        } catch (err) {
          await conn.rollback();
          throw err;
        } finally {
          conn.release();
        }

        if (managerId) await setDirectManager(pool, userId, managerId);

        const onboarding = sendInvite
          ? await sendOnboarding(pool, { userId, actorId: req.user.id, requestIp: req.ip })
          : null;

        return send.created(res, {
          id: userId,
          email,
          onboarding: onboarding
            ? { requested: true, sent: onboarding.ok, error: onboarding.ok ? null : onboarding.error }
            : { requested: false },
        });
      } catch (e) {
        console.error("create corporate staff error:", e);
        return send.serverErr(res);
      }
    },

    // PATCH /api/corporate/people/:id
    update: async (req, res) => {
      const userId = Number(req.params.id);
      try {
        const kind = await corporateKind(pool, userId);
        if (!kind) return send.notFound(res, "Not a corporate account");
        if (!(await canManage(pool, req, kind))) return send.forbidden(res);
        if (userId === req.user.id && req.body.is_active === false) {
          return send.bad(res, "You can't deactivate your own account");
        }

        const fields = ["full_name", "title", "phone", "is_active"];
        if (kind === "customer") fields.push("company");
        const sets = [];
        const vals = [];
        for (const f of fields) {
          if (f in req.body) {
            const v = f === "is_active" ? (req.body[f] ? 1 : 0) : clean(req.body[f]) || null;
            if (f === "full_name" && (!v || v.length < 2)) return send.bad(res, "Full name is required");
            if (f === "company" && !v) return send.bad(res, "Company is required for corporate customers");
            sets.push(`${f} = ?`);
            vals.push(v);
          }
        }
        if ("email" in req.body) {
          const email = clean(req.body.email)?.toLowerCase();
          if (!email || !EMAIL_RE.test(email)) return send.bad(res, "A valid email is required");
          const [[dupe]] = await pool.query("SELECT id FROM users WHERE email = ? AND id <> ?", [email, userId]);
          if (dupe) return send.bad(res, "Email is already in use by another account");
          sets.push("email = ?");
          vals.push(email);
        }

        // Staff: team / position move, and reporting line.
        if (kind === "staff" && ("team_id" in req.body || "is_lead" in req.body)) {
          const [[current]] = await pool.query(
            `SELECT tm.team_id, tm.is_lead FROM team_members tm JOIN teams t ON t.id = tm.team_id
              WHERE tm.user_id = ? AND t.workspace = 'corporate' ORDER BY tm.is_lead DESC LIMIT 1`,
            [userId]
          );
          const teamId = "team_id" in req.body ? Number(req.body.team_id) : current?.team_id;
          const isLead = "is_lead" in req.body ? !!req.body.is_lead : !!current?.is_lead;
          const [[team]] = await pool.query("SELECT id, name, workspace FROM teams WHERE id = ?", [teamId]);
          if (!team || team.workspace !== "corporate") return send.bad(res, "Choose a corporate team");
          if (isLead) {
            const [[lead]] = await pool.query(
              `SELECT u.full_name FROM team_members tm JOIN users u ON u.id = tm.user_id
                WHERE tm.team_id = ? AND tm.is_lead = 1 AND tm.user_id <> ? LIMIT 1`,
              [teamId, userId]
            );
            if (lead) return send.bad(res, `${team.name} already has a manager (${lead.full_name}).`);
          }
          // Only the primary corporate position is edited here; memberships in
          // other corporate teams (e.g. one manager leading two queues) stay.
          if (current && current.team_id !== teamId) {
            await pool.query("DELETE FROM team_members WHERE user_id = ? AND team_id = ?", [userId, current.team_id]);
          }
          await pool.query(
            `INSERT INTO team_members (team_id, user_id, is_lead) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_lead = VALUES(is_lead)`,
            [teamId, userId, isLead ? 1 : 0]
          );
        }

        if (kind === "staff" && "manager_id" in req.body) {
          const managerId = req.body.manager_id ? Number(req.body.manager_id) : null;
          if (managerId) {
            if (managerId === userId) return send.bad(res, "Someone can't report to themselves");
            if (!(await isCorporateStaff(pool, managerId))) return send.bad(res, "A reporting manager must be corporate staff.");
            if (await wouldCreateCycle(pool, userId, managerId)) {
              return send.bad(res, "That would create a reporting loop — the chosen manager already reports (directly or indirectly) to this person.");
            }
          }
          await setDirectManager(pool, userId, managerId);
        }

        if (sets.length) {
          vals.push(userId);
          await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, vals);
        }
        if ("is_active" in req.body) forgetSession(userId);
        return send.ok(res, { ok: true });
      } catch (e) {
        console.error("update corporate person error:", e);
        return send.serverErr(res);
      }
    },

    // POST /api/corporate/people/:id/onboarding — (re)send the set-password invitation
    resendOnboarding: async (req, res) => {
      const userId = Number(req.params.id);
      try {
        const kind = await corporateKind(pool, userId);
        if (!kind) return send.notFound(res, "Not a corporate account");
        if (!(await canManage(pool, req, kind))) return send.forbidden(res);
        const result = await sendOnboarding(pool, { userId, actorId: req.user.id, requestIp: req.ip });
        if (!result.ok) return res.status(result.status).json({ error: result.error });
        return send.ok(res, { ok: true, email: result.email, message: `Onboarding email sent to ${result.email}` });
      } catch (e) {
        console.error("resend onboarding error:", e);
        return send.serverErr(res);
      }
    },

    // POST /api/corporate/people/:id/reset-password
    sendReset: async (req, res) => {
      const userId = Number(req.params.id);
      try {
        const kind = await corporateKind(pool, userId);
        if (!kind) return send.notFound(res, "Not a corporate account");
        if (!(await canManage(pool, req, kind))) return send.forbidden(res);
        const result = await sendAdminReset(pool, { userId, adminId: req.user.id, requestIp: req.ip });
        if (!result.ok) return res.status(result.status).json({ error: result.error });
        return send.ok(res, { ok: true, email: result.email, message: `Password reset link sent to ${result.email}` });
      } catch (e) {
        console.error("corporate reset error:", e);
        return send.serverErr(res);
      }
    },

    // GET /api/corporate/hierarchy — the corporate org chart
    hierarchy: async (req, res) => {
      try {
        const structure = await loadCorporateStructure(pool);
        const ids = [...structure.keys()];
        if (!ids.length) return send.ok(res, { users: [], hierarchy: [], can_edit: isAdmin(req) });
        const [users] = await pool.query(
          `SELECT id, full_name, email, title, is_active, must_set_password FROM users WHERE id IN (?) AND is_active = 1 ORDER BY full_name`,
          [ids]
        );
        const positions = await loadPositions(pool, ids);
        const out = users.map((u) => {
          const s = structure.get(u.id);
          const pos = positions.get(u.id) || [];
          return {
            ...u,
            must_set_password: !!u.must_set_password,
            roles: ["agent"],
            positions: pos,
            team_name: pos.map((p) => p.team_name).join(", "),
            manager_id: s.manager_id,
            outside_manager: s.outside_manager,
            org_level: s.org_level,
            report_count: s.report_count,
          };
        });
        // Only corporate-to-corporate links: anyone whose manager sits outside
        // Corporate is a root of this chart.
        const hierarchy = out
          .filter((u) => u.manager_id)
          .map((u) => ({ user_id: u.id, manager_id: u.manager_id, level: 1, is_active: 1 }));
        return send.ok(res, { users: out, hierarchy, can_edit: isAdmin(req) });
      } catch (e) {
        console.error("corporate hierarchy error:", e);
        return send.serverErr(res);
      }
    },
  };
}
