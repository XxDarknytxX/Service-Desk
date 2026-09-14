// src/controllers/teamController.js
import { validationResult } from "express-validator";
import { getWorkspaceAccess, canAccessWorkspace, WORKSPACES } from "../middleware/workspace.js";

const CORPORATE_ROLES = ["triage", "queue", "service_delivery"];

/**
 * Validates the workspace / corporate_role pair from a create or update body.
 * Returns { error } or { workspace, corporateRole } (either may be undefined when
 * not supplied).
 */
function parseTeamWorkspace(body, existing = null) {
  let workspace = body.workspace;
  let corporateRole = body.corporate_role;
  if (workspace !== undefined && !WORKSPACES.includes(workspace)) {
    return { error: "workspace must be 'internal' or 'corporate'" };
  }
  if (corporateRole !== undefined && corporateRole !== null && !CORPORATE_ROLES.includes(corporateRole)) {
    return { error: "corporate_role must be triage, queue or service_delivery" };
  }
  const finalWs = workspace ?? existing?.workspace ?? "internal";
  // An internal team has no corporate role; clear it when moving a team inward.
  if (finalWs === "internal") {
    if (corporateRole) return { error: "Only corporate teams can have a corporate role" };
    if (workspace === "internal") corporateRole = null;
  }
  return { workspace, corporateRole };
}

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

// Canonical module registry — single source of truth for all controllable modules
export const MODULE_REGISTRY = [
  { key: "dashboard",      label: "Dashboard",         section: "Main",           icon: "dashboard",    roles: null,                   description: "Overview metrics, recent tickets, and activity feed" },
  { key: "tickets",        label: "Tickets",           section: "Main",           icon: "tickets",      roles: null,                   description: "Create, view, and manage support tickets" },
  { key: "approvals",      label: "Approvals",         section: "Main",           icon: "checkCircle",  roles: null,                   description: "View and action pending approval requests" },
  { key: "users",          label: "Users",             section: "Administration", icon: "users",        roles: ["admin", "agent"],      description: "Manage user accounts, roles, and profiles" },
  { key: "teams",          label: "Teams",             section: "Administration", icon: "teams",        roles: ["admin"],               description: "Manage teams, members, and team privileges" },
  { key: "hierarchy",      label: "Org Hierarchy",     section: "Administration", icon: "sitemap",      roles: ["admin", "agent"],      description: "View and manage organizational reporting structure" },
  { key: "approval-rules", label: "Approval Rules",    section: "Operations",     icon: "settings",     roles: ["admin"],               description: "Configure automatic approval workflows and rules" },
  { key: "templates",      label: "Ticket Templates",  section: "Operations",     icon: "clipboard",    roles: ["admin"],               description: "Build and manage ticket form templates" },
  { key: "assets",         label: "Assets",            section: "Operations",     icon: "assets",       roles: ["admin", "agent"],      description: "Track and manage IT assets and inventory" },
  { key: "sla",            label: "SLA Policies",      section: "Operations",     icon: "sla",          roles: ["admin"],               description: "Configure SLA response and resolution targets" },
  { key: "knowledge-base", label: "Knowledge Base",    section: "Operations",     icon: "knowledgeBase",roles: null,                   description: "Browse and manage help articles and FAQs" },
  { key: "forms",          label: "Customer Forms",    section: "Operations",     icon: "send",         roles: ["admin", "agent"],      description: "Build customer-facing forms and send one-time fill links" },
  { key: "reports",        label: "Reports",           section: "Operations",     icon: "reports",      roles: ["admin", "agent"],      description: "Analytics, agent performance, and SLA compliance" },
];

export function makeTeamController(pool) {
  return {
    // GET /api/teams
    // Optional query param: ?userId=X to get teams for a specific user
    list: async (req, res) => {
      const userId = req.query.userId;

      try {
        // Staff see the teams of their own app; admins see both, or one via
        // ?workspace=. Teams are how people and queues are organised, so the
        // corporate and internal desks never see each other's.
        const access = await getWorkspaceAccess(req);
        let visible = access.workspaces;
        // Same precedence as resolveRequestWorkspace: ?workspace= then the
        // X-Workspace header the app sends for the view on screen. Without the
        // header check an admin (who can see both) got every team in either view.
        const requested = req.query.workspace || req.headers["x-workspace"];
        if (requested) {
          if (!WORKSPACES.includes(requested) || !canAccessWorkspace(access, requested)) {
            return res.status(403).json({ error: "You don't have access to this workspace" });
          }
          visible = [requested];
        }

        if (userId) {
          // Get teams for specific user
          const [rows] = await pool.query(
            `SELECT t.id, t.name, t.description, t.workspace, t.corporate_role, tm.is_lead
             FROM teams t
             INNER JOIN team_members tm ON tm.team_id = t.id
             WHERE tm.user_id = ? AND t.workspace IN (?)
             ORDER BY t.name ASC`,
            [userId, visible]
          );
          return send.ok(res, { teams: rows });
        } else {
          // Get all teams with member count
          const [rows] = await pool.query(
            `SELECT t.id, t.name, t.description, t.workspace, t.corporate_role, t.created_at, t.updated_at,
                    COUNT(tm.user_id) as member_count
             FROM teams t
             LEFT JOIN team_members tm ON tm.team_id = t.id
             WHERE t.workspace IN (?)
             GROUP BY t.id
             ORDER BY t.name ASC`,
            [visible]
          );
          return send.ok(res, { items: rows });
        }
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/teams/:id/members
    getMembers: async (req, res) => {
      const teamId = Number(req.params.id);
      try {
        const [[teamRow]] = await pool.query("SELECT workspace FROM teams WHERE id = ?", [teamId]);
        if (teamRow && !canAccessWorkspace(await getWorkspaceAccess(req), teamRow.workspace)) {
          return res.status(403).json({ error: "You don't have access to this team" });
        }

        // Get team members
        const [rows] = await pool.query(
          `SELECT u.id, u.email, u.full_name, u.title, tm.is_lead
           FROM team_members tm
           INNER JOIN users u ON u.id = tm.user_id
           WHERE tm.team_id = ? AND u.is_active = 1
           ORDER BY tm.is_lead DESC, u.full_name ASC`,
          [teamId]
        );

        const userIds = rows.map(r => r.id);
        let rolesMap = {};
        let managersMap = {};

        if (userIds.length > 0) {
          // Get roles for all members
          const [userRoles] = await pool.query(
            `SELECT ur.user_id, r.name as role
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id IN (?)`,
            [userIds]
          );

          userRoles.forEach(ur => {
            if (!rolesMap[ur.user_id]) rolesMap[ur.user_id] = [];
            rolesMap[ur.user_id].push(ur.role);
          });

          // Get direct managers for all members
          const [hierarchyRows] = await pool.query(
            `SELECT uh.user_id, uh.manager_id, m.full_name as manager_name, m.title as manager_title
             FROM user_hierarchy uh
             INNER JOIN users m ON m.id = uh.manager_id
             WHERE uh.user_id IN (?) AND uh.level = 1 AND uh.is_active = 1`,
            [userIds]
          );

          hierarchyRows.forEach(h => {
            managersMap[h.user_id] = {
              id: h.manager_id,
              full_name: h.manager_name,
              title: h.manager_title
            };
          });
        }

        // Add roles and manager to members
        const members = rows.map(row => ({
          ...row,
          roles: rolesMap[row.id] || [],
          manager: managersMap[row.id] || null
        }));

        return send.ok(res, { members });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/teams
    create: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { name, description } = req.body;
      const parsed = parseTeamWorkspace(req.body);
      if (parsed.error) return send.bad(res, parsed.error);
      const workspace = parsed.workspace || "internal";
      const corporateRole = workspace === "corporate" ? parsed.corporateRole || null : null;
      try {
        const [result] = await pool.query(
          `INSERT INTO teams (name, description, workspace, corporate_role) VALUES (?, ?, ?, ?)`,
          [name, description || null, workspace, corporateRole]
        );
        return send.created(res, { id: result.insertId, name, description, workspace, corporate_role: corporateRole });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PATCH /api/teams/:id
    update: async (req, res) => {
      const teamId = Number(req.params.id);
      const { name, description } = req.body;
      try {
        const updates = [];
        const values = [];

        if (name !== undefined) {
          updates.push("name = ?");
          values.push(name);
        }
        if (description !== undefined) {
          updates.push("description = ?");
          values.push(description);
        }

        if (req.body.workspace !== undefined || req.body.corporate_role !== undefined) {
          const [[existing]] = await pool.query("SELECT workspace, corporate_role FROM teams WHERE id = ?", [teamId]);
          if (!existing) return send.bad(res, "Team not found");
          const parsed = parseTeamWorkspace(req.body, existing);
          if (parsed.error) return send.bad(res, parsed.error);

          // Moving a team that customer categories route to out of the corporate
          // app would silently strand every request raised in those categories.
          if (parsed.workspace === "internal" && existing.workspace === "corporate") {
            const [[routed]] = await pool.query(
              "SELECT COUNT(*) AS n FROM service_categories WHERE routing_team_id = ?", [teamId]
            );
            if (routed.n > 0) {
              return send.bad(res, "Customer service categories route to this team — re-route them before moving it to the internal desk.");
            }
          }
          if (parsed.workspace !== undefined) { updates.push("workspace = ?"); values.push(parsed.workspace); }
          if (parsed.corporateRole !== undefined) { updates.push("corporate_role = ?"); values.push(parsed.corporateRole); }
        }

        if (updates.length === 0) return send.bad(res, "No fields to update");

        await pool.query(`UPDATE teams SET ${updates.join(", ")} WHERE id = ?`, [
          ...values,
          teamId,
        ]);
        return send.ok(res, { ok: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/teams/:id
    remove: async (req, res) => {
      const teamId = Number(req.params.id);
      try {
        // Deleting a routing team would null out category routing (FK SET NULL)
        // and strand every new request in those categories.
        const [[routed]] = await pool.query(
          "SELECT COUNT(*) AS n FROM service_categories WHERE routing_team_id = ?", [teamId]
        );
        if (routed.n > 0) {
          return send.bad(res, "Customer service categories route to this team — re-route them before deleting it.");
        }
        const [result] = await pool.query(`DELETE FROM teams WHERE id = ?`, [teamId]);
        if (result.affectedRows === 0) return send.bad(res, "Team not found");
        return send.ok(res, { ok: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/teams/members - Add user to team
    addMember: async (req, res) => {
      const { team_id, user_id, is_lead } = req.body;

      if (!team_id || !user_id) {
        return send.bad(res, "team_id and user_id are required");
      }

      try {
        // Customers are never team members: membership is what gives STAFF
        // access to a queue and to the corporate app.
        const [[cust]] = await pool.query(
          `SELECT 1 AS yes FROM user_roles ur JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = ? AND r.name = 'corporate_customer' LIMIT 1`,
          [user_id]
        );
        if (cust) return send.bad(res, "Corporate customers can't be added to teams.");

        await pool.query(
          `INSERT INTO team_members (team_id, user_id, is_lead)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE is_lead = VALUES(is_lead)`,
          [team_id, user_id, is_lead || false]
        );
        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/teams/members/:userId - Remove user from all teams
    removeMember: async (req, res) => {
      const userId = Number(req.params.userId);

      try {
        await pool.query(`DELETE FROM team_members WHERE user_id = ?`, [userId]);
        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/teams/modules — return the full module registry
    getModuleRegistry: async (_req, res) => {
      return send.ok(res, { modules: MODULE_REGISTRY });
    },

    // GET /api/teams/:id/access — get enabled modules for a team
    getTeamAccess: async (req, res) => {
      const teamId = Number(req.params.id);
      try {
        const [rows] = await pool.query(
          `SELECT module_key FROM team_module_access WHERE team_id = ?`,
          [teamId]
        );
        // If no rows → team is unrestricted (null means no custom config)
        const modules = rows.map(r => r.module_key);
        return send.ok(res, {
          team_id: teamId,
          restricted: rows.length > 0,
          modules,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/teams/:id/access — set enabled modules for a team
    setTeamAccess: async (req, res) => {
      const teamId = Number(req.params.id);
      const { modules, restricted } = req.body;

      if (restricted && (!Array.isArray(modules) || modules.length === 0)) {
        return send.bad(res, "At least one module must be enabled when restricting access");
      }

      // Validate module keys against registry
      const validKeys = MODULE_REGISTRY.map(m => m.key);
      if (restricted) {
        const invalid = modules.filter(k => !validKeys.includes(k));
        if (invalid.length > 0) {
          return send.bad(res, `Invalid module keys: ${invalid.join(", ")}`);
        }
      }

      try {
        // Verify team exists
        const [team] = await pool.query("SELECT id FROM teams WHERE id = ?", [teamId]);
        if (team.length === 0) return send.bad(res, "Team not found");

        // Clear existing access rules
        await pool.query("DELETE FROM team_module_access WHERE team_id = ?", [teamId]);

        // If restricted, insert new access rules
        if (restricted && modules.length > 0) {
          const values = modules.map(key => [teamId, key]);
          await pool.query(
            `INSERT INTO team_module_access (team_id, module_key) VALUES ?`,
            [values]
          );
        }

        return send.ok(res, {
          team_id: teamId,
          restricted: !!restricted,
          modules: restricted ? modules : [],
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
