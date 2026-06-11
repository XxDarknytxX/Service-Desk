// src/controllers/metaController.js
const send = {
  ok: (res, data = {}) => res.json(data),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeMetaController(pool) {
  return {
    // GET /api/meta
    meta: async (_req, res) => {
      try {
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
        const [teams] = await pool.query(
          `SELECT id, name FROM teams ORDER BY name`
        );
        const [roles] = await pool.query(`SELECT id, name FROM roles ORDER BY name`);
        const [agents] = await pool.query(
          `SELECT u.id, u.full_name, u.email
           FROM users u
           INNER JOIN user_roles ur ON ur.user_id = u.id
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE r.name IN ('admin', 'agent') AND u.is_active = 1
           GROUP BY u.id
           ORDER BY u.full_name`
        );
        const [organizations] = await pool.query(
          `SELECT id, name FROM organizations ORDER BY name`
        );
        const [departments] = await pool.query(
          `SELECT id, name FROM departments ORDER BY name`
        );

        return send.ok(res, {
          statuses,
          priorities,
          types,
          channels,
          teams,
          roles,
          agents,
          organizations,
          departments,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
