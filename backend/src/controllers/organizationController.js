// src/controllers/organizationController.js
import { validationResult } from "express-validator";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeOrganizationController(pool) {
  return {
    // GET /api/organizations
    list: async (_req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT id, name, domain, industry, size, website, notes, created_at, updated_at
           FROM organizations
           ORDER BY name ASC`
        );
        return send.ok(res, { items: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/organizations
    create: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { name, domain, industry, size, website, notes } = req.body;
      try {
        const [result] = await pool.query(
          `INSERT INTO organizations (name, domain, industry, size, website, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [name, domain || null, industry || null, size || null, website || null, notes || null]
        );
        return send.created(res, { id: result.insertId, name });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PATCH /api/organizations/:id
    update: async (req, res) => {
      const orgId = Number(req.params.id);
      const { name, domain, industry, size, website, notes } = req.body;
      try {
        const updates = [];
        const values = [];
        if (name !== undefined) { updates.push("name = ?"); values.push(name); }
        if (domain !== undefined) { updates.push("domain = ?"); values.push(domain); }
        if (industry !== undefined) { updates.push("industry = ?"); values.push(industry); }
        if (size !== undefined) { updates.push("size = ?"); values.push(size); }
        if (website !== undefined) { updates.push("website = ?"); values.push(website); }
        if (notes !== undefined) { updates.push("notes = ?"); values.push(notes); }
        if (updates.length === 0) return send.bad(res, "No fields to update");

        const [result] = await pool.query(
          `UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`,
          [...values, orgId]
        );
        if (result.affectedRows === 0) return send.bad(res, "Organization not found");
        return send.ok(res, { ok: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/organizations/:id
    remove: async (req, res) => {
      const orgId = Number(req.params.id);
      try {
        const [result] = await pool.query(`DELETE FROM organizations WHERE id = ?`, [orgId]);
        if (result.affectedRows === 0) return send.bad(res, "Organization not found");
        return send.ok(res, { ok: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
