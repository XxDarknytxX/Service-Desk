// src/controllers/metaController.js
import { resolveRequestWorkspace } from "../middleware/workspace.js";
import { corporateOnlyTeamSql } from "../utils/corporateRoles.js";

const send = {
  ok: (res, data = {}) => res.json(data),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeMetaController(pool) {
  return {
    // GET /api/meta[?workspace=internal|corporate]
    //
    // Lookup data for forms, scoped to the app being used. Customers get only
    // what raising and reading their own requests needs — never the staff
    // directory, internal teams, departments or organisations (previously any
    // login could read all of it from here).
    meta: async (req, res) => {
      try {
        let workspace, access;
        try {
          ({ workspace, access } = await resolveRequestWorkspace(req));
        } catch (err) {
          return res.status(err.status || 403).json({ error: err.message });
        }
        const isCorporate = workspace === "corporate";

        const [statuses] = await pool.query(
          `SELECT id, \`key\`, label, is_closed, sort_order FROM ticket_statuses ORDER BY sort_order`
        );
        const [priorities] = await pool.query(
          `SELECT id, \`key\`, label, sort_order, response_sla_minutes, resolve_sla_minutes
           FROM ticket_priorities ORDER BY sort_order`
        );
        const [types] = await pool.query(
          `SELECT id, \`key\`, label FROM ticket_types ORDER BY label`
        );
        const [channels] = await pool.query(
          `SELECT id, \`key\`, label FROM ticket_channels ORDER BY label`
        );

        // Service categories are the corporate desk's entry point. Only those
        // that actually route to a corporate team are offered — a category that
        // routes nowhere would just produce a rejected request.
        let serviceCategories = [];
        if (isCorporate) {
          [serviceCategories] = await pool.query(
            `SELECT sc.id, sc.\`key\`, sc.name, sc.description, sc.icon, sc.routing_team_id,
                    sc.is_triage, sc.sla_grace_pct, t.name AS routing_team_name
             FROM service_categories sc
             JOIN teams t ON t.id = sc.routing_team_id AND t.workspace = 'corporate'
             WHERE sc.is_active = 1
             ORDER BY sc.sort_order`
          );
        }

        if (access.isCustomer) {
          return send.ok(res, {
            workspace, statuses, priorities, types, channels, serviceCategories,
            teams: [], roles: [], agents: [], organizations: [], departments: [],
          });
        }

        const [teams] = await pool.query(
          `SELECT id, name, workspace, corporate_role FROM teams WHERE workspace = ? ORDER BY name`,
          [workspace]
        );
        const [roles] = await pool.query(`SELECT id, name FROM roles ORDER BY name`);
        // Agents of THIS app: corporate staff are members of corporate teams;
        // internal staff are everyone not in a corporate-only team. Admins and
        // the corporate business / Executive teams appear in both.
        const inAnyCorporateTeam = `EXISTS (SELECT 1 FROM team_members tm JOIN teams tt ON tt.id = tm.team_id
                                            WHERE tm.user_id = u.id AND tt.workspace = 'corporate')`;
        const inCorporateOnlyTeam = `EXISTS (SELECT 1 FROM team_members tm JOIN teams tt ON tt.id = tm.team_id
                                             WHERE tm.user_id = u.id AND ${corporateOnlyTeamSql("tt")})`;
        const [agents] = await pool.query(
          `SELECT u.id, u.full_name, u.email
           FROM users u
           INNER JOIN user_roles ur ON ur.user_id = u.id
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE r.name IN ('admin', 'agent') AND u.is_active = 1
             AND (
               EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id
                        WHERE ur2.user_id = u.id AND r2.name = 'admin')
               OR ${isCorporate ? inAnyCorporateTeam : `NOT ${inCorporateOnlyTeam}`}
             )
           GROUP BY u.id
           ORDER BY u.full_name`
        );

        let organizations = [];
        let departments = [];
        if (!isCorporate) {
          [organizations] = await pool.query(`SELECT id, name FROM organizations ORDER BY name`);
          [departments] = await pool.query(`SELECT id, name FROM departments ORDER BY name`);
        }

        return send.ok(res, {
          workspace,
          statuses,
          priorities,
          types,
          channels,
          teams,
          roles,
          agents,
          organizations,
          departments,
          serviceCategories,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
