// src/controllers/departmentController.js
import { validationResult } from "express-validator";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeDepartmentController(pool) {
  return {
    // GET /api/departments
    list: async (req, res) => {
      try {
        const [rows] = await pool.query(`
          SELECT d.*,
                 u.full_name as head_name,
                 u.email as head_email,
                 pd.name as parent_name,
                 (SELECT COUNT(*) FROM teams WHERE department_id = d.id) as team_count,
                 (SELECT COUNT(*) FROM users WHERE department_id = d.id) as user_count
          FROM departments d
          LEFT JOIN users u ON d.head_user_id = u.id
          LEFT JOIN departments pd ON d.parent_department_id = pd.id
          ORDER BY d.name ASC
        `);
        return send.ok(res, { items: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/departments/:id
    getById: async (req, res) => {
      const deptId = Number(req.params.id);
      try {
        const [rows] = await pool.query(`
          SELECT d.*,
                 u.full_name as head_name,
                 u.email as head_email,
                 pd.name as parent_name
          FROM departments d
          LEFT JOIN users u ON d.head_user_id = u.id
          LEFT JOIN departments pd ON d.parent_department_id = pd.id
          WHERE d.id = ?
        `, [deptId]);

        if (rows.length === 0) {
          return send.notFound(res, "Department not found");
        }

        // Get teams in this department
        const [teams] = await pool.query(`
          SELECT id, name, description
          FROM teams
          WHERE department_id = ?
          ORDER BY name ASC
        `, [deptId]);

        // Get users in this department
        const [users] = await pool.query(`
          SELECT id, full_name, email, title
          FROM users
          WHERE department_id = ? AND is_active = 1
          ORDER BY full_name ASC
        `, [deptId]);

        return send.ok(res, {
          department: rows[0],
          teams,
          users
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/departments
    create: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { name, description, parent_department_id, head_user_id } = req.body;

      try {
        // Check for circular reference if parent is specified
        if (parent_department_id) {
          const [parent] = await pool.query(
            'SELECT id FROM departments WHERE id = ?',
            [parent_department_id]
          );
          if (parent.length === 0) {
            return send.bad(res, "Parent department not found");
          }
        }

        const [result] = await pool.query(
          `INSERT INTO departments (name, description, parent_department_id, head_user_id)
           VALUES (?, ?, ?, ?)`,
          [name, description || null, parent_department_id || null, head_user_id || null]
        );

        return send.created(res, {
          id: result.insertId,
          name,
          description
        });
      } catch (e) {
        console.error(e);
        if (e.code === 'ER_DUP_ENTRY') {
          return send.bad(res, "Department with this name already exists");
        }
        return send.serverErr(res);
      }
    },

    // PATCH /api/departments/:id
    update: async (req, res) => {
      const deptId = Number(req.params.id);
      const { name, description, parent_department_id, head_user_id } = req.body;

      try {
        // Check department exists
        const [existing] = await pool.query('SELECT id FROM departments WHERE id = ?', [deptId]);
        if (existing.length === 0) {
          return send.notFound(res, "Department not found");
        }

        // Prevent circular reference
        if (parent_department_id === deptId) {
          return send.bad(res, "Department cannot be its own parent");
        }

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
        if (parent_department_id !== undefined) {
          updates.push("parent_department_id = ?");
          values.push(parent_department_id || null);
        }
        if (head_user_id !== undefined) {
          updates.push("head_user_id = ?");
          values.push(head_user_id || null);
        }

        if (updates.length === 0) {
          return send.bad(res, "No fields to update");
        }

        values.push(deptId);

        await pool.query(
          `UPDATE departments SET ${updates.join(", ")} WHERE id = ?`,
          values
        );

        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/departments/:id
    delete: async (req, res) => {
      const deptId = Number(req.params.id);

      try {
        // Check if department has child departments
        const [children] = await pool.query(
          'SELECT COUNT(*) as count FROM departments WHERE parent_department_id = ?',
          [deptId]
        );

        if (children[0].count > 0) {
          return send.bad(res, "Cannot delete department with sub-departments");
        }

        // Check if department has teams
        const [teams] = await pool.query(
          'SELECT COUNT(*) as count FROM teams WHERE department_id = ?',
          [deptId]
        );

        if (teams[0].count > 0) {
          return send.bad(res, "Cannot delete department with teams. Please reassign teams first.");
        }

        const [result] = await pool.query('DELETE FROM departments WHERE id = ?', [deptId]);

        if (result.affectedRows === 0) {
          return send.notFound(res, "Department not found");
        }

        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/departments/:id/hierarchy
    getHierarchy: async (req, res) => {
      const deptId = Number(req.params.id);

      try {
        // Get department with all children recursively
        const [rows] = await pool.query(`
          WITH RECURSIVE dept_tree AS (
            -- Anchor: start with the requested department
            SELECT id, name, description, parent_department_id, head_user_id, 0 as level
            FROM departments
            WHERE id = ?

            UNION ALL

            -- Recursive: get all children
            SELECT d.id, d.name, d.description, d.parent_department_id, d.head_user_id, dt.level + 1
            FROM departments d
            INNER JOIN dept_tree dt ON d.parent_department_id = dt.id
          )
          SELECT dt.*,
                 u.full_name as head_name,
                 (SELECT COUNT(*) FROM teams WHERE department_id = dt.id) as team_count
          FROM dept_tree dt
          LEFT JOIN users u ON dt.head_user_id = u.id
          ORDER BY dt.level, dt.name
        `, [deptId]);

        return send.ok(res, { hierarchy: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
