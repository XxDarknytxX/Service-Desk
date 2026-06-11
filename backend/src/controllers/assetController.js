// src/controllers/assetController.js
// Comprehensive Asset Management Controller — V2
export function makeAssetController(pool) {
  // ── helpers ────────────────────────────────────────────────────────────────
  const assetSelect = `
    SELECT a.*,
           ac.name  AS category_name,
           ac.icon  AS category_icon,
           ac.color AS category_color,
           at.name  AS type_name,
           at.icon  AS type_icon,
           u.full_name  AS assigned_user_name,
           u.email      AS assigned_user_email,
           o.name       AS assigned_org_name,
           d.name       AS department_name,
           co.full_name AS checked_out_by_name
    FROM assets a
    LEFT JOIN asset_categories ac ON a.category_id = ac.id
    LEFT JOIN asset_types      at ON a.asset_type_id = at.id
    LEFT JOIN users            u  ON a.assigned_to_user_id = u.id
    LEFT JOIN organizations    o  ON a.assigned_to_org_id  = o.id
    LEFT JOIN departments      d  ON a.department_id = d.id
    LEFT JOIN asset_assignments aa2 ON aa2.asset_id = a.id AND aa2.checked_in_at IS NULL
    LEFT JOIN users co ON co.id = aa2.checked_out_by
  `;

  return {
    // ══════════════════════════════════════════════════════════════════════════
    // ASSET CATEGORIES
    // ══════════════════════════════════════════════════════════════════════════

    async getAssetCategories(req, res) {
      try {
        const [rows] = await pool.query(`
          SELECT ac.*,
                 COUNT(DISTINCT at.id) AS type_count,
                 COUNT(DISTINCT a.id)  AS asset_count
          FROM asset_categories ac
          LEFT JOIN asset_types at ON at.category_id = ac.id
          LEFT JOIN assets a ON a.category_id = ac.id
          GROUP BY ac.id
          ORDER BY ac.name
        `);
        res.json(rows);
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch categories" }); }
    },

    async createAssetCategory(req, res) {
      try {
        const { name, description, icon = "box", color = "blue" } = req.body;
        if (!name) return res.status(400).json({ error: "Name is required" });
        const [r] = await pool.query(
          `INSERT INTO asset_categories (name, description, icon, color) VALUES (?,?,?,?)`,
          [name, description, icon, color]
        );
        res.status(201).json({ id: r.insertId, name, description, icon, color });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to create category" }); }
    },

    async updateAssetCategory(req, res) {
      try {
        const { id } = req.params;
        const { name, description, icon, color } = req.body;
        await pool.query(
          `UPDATE asset_categories SET name=?, description=?, icon=?, color=? WHERE id=?`,
          [name, description, icon, color, id]
        );
        res.json({ id: Number(id), name, description, icon, color });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to update category" }); }
    },

    async deleteAssetCategory(req, res) {
      try {
        const { id } = req.params;
        await pool.query(`DELETE FROM asset_categories WHERE id=?`, [id]);
        res.json({ success: true });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to delete category" }); }
    },

    // ══════════════════════════════════════════════════════════════════════════
    // ASSET TYPES
    // ══════════════════════════════════════════════════════════════════════════

    async getAssetTypes(req, res) {
      try {
        const [rows] = await pool.query(`
          SELECT at.*,
                 ac.name AS category_name, ac.color AS category_color,
                 COUNT(a.id) AS asset_count
          FROM asset_types at
          LEFT JOIN asset_categories ac ON at.category_id = ac.id
          LEFT JOIN assets a ON a.asset_type_id = at.id
          GROUP BY at.id
          ORDER BY ac.name, at.name
        `);
        res.json(rows);
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch asset types" }); }
    },

    async createAssetType(req, res) {
      try {
        const { name, description, icon, category_id } = req.body;
        if (!name) return res.status(400).json({ error: "Name is required" });
        const [r] = await pool.query(
          `INSERT INTO asset_types (name, description, icon, category_id) VALUES (?,?,?,?)`,
          [name, description, icon, category_id || null]
        );
        res.status(201).json({ id: r.insertId, name, description, icon, category_id });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to create asset type" }); }
    },

    async updateAssetType(req, res) {
      try {
        const { id } = req.params;
        const { name, description, icon, category_id } = req.body;
        await pool.query(
          `UPDATE asset_types SET name=?, description=?, icon=?, category_id=? WHERE id=?`,
          [name, description, icon, category_id || null, id]
        );
        res.json({ id: Number(id) });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to update asset type" }); }
    },

    async deleteAssetType(req, res) {
      try {
        const { id } = req.params;
        const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) AS cnt FROM assets WHERE asset_type_id=?`, [id]);
        if (cnt > 0) return res.status(400).json({ error: `Cannot delete: ${cnt} assets use this type` });
        await pool.query(`DELETE FROM asset_types WHERE id=?`, [id]);
        res.json({ success: true });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to delete asset type" }); }
    },

    // ══════════════════════════════════════════════════════════════════════════
    // ASSETS  (CRUD + SEARCH + BULK)
    // ══════════════════════════════════════════════════════════════════════════

    async getAssets(req, res) {
      try {
        const { type_id, category_id, status, condition, assigned_to, search, department_id, warranty_expiring_days } = req.query;
        let where = "WHERE 1=1";
        const p = [];

        if (type_id)     { where += " AND a.asset_type_id=?";        p.push(type_id); }
        if (category_id) { where += " AND a.category_id=?";          p.push(category_id); }
        if (status)      { where += " AND a.status=?";                p.push(status); }
        if (condition)   { where += " AND a.\`condition\`=?";         p.push(condition); }
        if (assigned_to) { where += " AND a.assigned_to_user_id=?";   p.push(assigned_to); }
        if (department_id){ where += " AND a.department_id=?";        p.push(department_id); }
        if (search) {
          where += ` AND (a.name LIKE ? OR a.asset_tag LIKE ? OR a.serial_number LIKE ?
                         OR a.manufacturer LIKE ? OR a.model LIKE ?)`;
          const q = `%${search}%`;
          p.push(q, q, q, q, q);
        }
        if (warranty_expiring_days) {
          where += ` AND a.warranty_expiry_date IS NOT NULL
                     AND a.warranty_expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)`;
          p.push(warranty_expiring_days);
        }

        const [rows] = await pool.query(
          `${assetSelect} ${where} ORDER BY a.updated_at DESC`,
          p
        );
        res.json(rows);
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch assets" }); }
    },

    async getAsset(req, res) {
      try {
        const [rows] = await pool.query(`${assetSelect} WHERE a.id=?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: "Asset not found" });
        res.json(rows[0]);
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch asset" }); }
    },

    async createAsset(req, res) {
      try {
        const {
          asset_tag, name, asset_type_id, category_id, serial_number, manufacturer, model,
          status = "active", condition, assigned_to_user_id, assigned_to_org_id, location,
          purchase_date, purchase_cost, warranty_expiry_date, notes, supplier, order_number,
          expected_lifespan_years, current_value, depreciation_rate, department_id,
        } = req.body;

        if (!name || !asset_type_id) return res.status(400).json({ error: "Name and asset type are required" });

        // Auto-generate tag if not provided
        let tag = asset_tag;
        if (!tag) {
          const [[{ max_id }]] = await pool.query(`SELECT COALESCE(MAX(id),0) AS max_id FROM assets`);
          tag = `AST-${String(max_id + 1).padStart(4, "0")}`;
        }

        const [r] = await pool.query(`
          INSERT INTO assets (
            asset_tag, name, asset_type_id, category_id, serial_number, manufacturer, model,
            status, \`condition\`, assigned_to_user_id, assigned_to_org_id, location,
            purchase_date, purchase_cost, warranty_expiry_date, notes, supplier, order_number,
            expected_lifespan_years, current_value, depreciation_rate, department_id
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            tag, name, asset_type_id, category_id || null, serial_number, manufacturer, model,
            status, condition || null, assigned_to_user_id || null, assigned_to_org_id || null, location,
            purchase_date || null, purchase_cost || null, warranty_expiry_date || null, notes,
            supplier, order_number, expected_lifespan_years || null, current_value || null,
            depreciation_rate || null, department_id || null,
          ]
        );

        // Log assignment if assigned on creation
        if (assigned_to_user_id && req.user?.id) {
          await pool.query(
            `INSERT INTO asset_assignments (asset_id, assigned_to_user_id, assigned_to_org_id, location, notes, checked_out_by)
             VALUES (?,?,?,?,?,?)`,
            [r.insertId, assigned_to_user_id, assigned_to_org_id || null, location, "Initial assignment", req.user.id]
          );
        }

        res.status(201).json({ id: r.insertId, asset_tag: tag });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to create asset" }); }
    },

    async updateAsset(req, res) {
      try {
        const { id } = req.params;
        const {
          asset_tag, name, asset_type_id, category_id, serial_number, manufacturer, model,
          status, condition, assigned_to_user_id, assigned_to_org_id, location,
          purchase_date, purchase_cost, warranty_expiry_date, notes, supplier, order_number,
          expected_lifespan_years, current_value, depreciation_rate, department_id,
        } = req.body;

        await pool.query(`
          UPDATE assets SET
            asset_tag=?, name=?, asset_type_id=?, category_id=?, serial_number=?, manufacturer=?, model=?,
            status=?, \`condition\`=?, assigned_to_user_id=?, assigned_to_org_id=?, location=?,
            purchase_date=?, purchase_cost=?, warranty_expiry_date=?, notes=?, supplier=?, order_number=?,
            expected_lifespan_years=?, current_value=?, depreciation_rate=?, department_id=?
          WHERE id=?`,
          [
            asset_tag, name, asset_type_id, category_id || null, serial_number, manufacturer, model,
            status, condition || null, assigned_to_user_id || null, assigned_to_org_id || null, location,
            purchase_date || null, purchase_cost || null, warranty_expiry_date || null, notes,
            supplier, order_number, expected_lifespan_years || null, current_value || null,
            depreciation_rate || null, department_id || null, id,
          ]
        );
        res.json({ id: Number(id) });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to update asset" }); }
    },

    async deleteAsset(req, res) {
      try {
        await pool.query(`DELETE FROM assets WHERE id=?`, [req.params.id]);
        res.json({ success: true });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to delete asset" }); }
    },

    async bulkUpdateAssets(req, res) {
      try {
        const { ids, action, value } = req.body;
        if (!ids?.length) return res.status(400).json({ error: "No asset IDs provided" });

        const placeholders = ids.map(() => "?").join(",");
        if (action === "delete") {
          await pool.query(`DELETE FROM assets WHERE id IN (${placeholders})`, ids);
        } else if (action === "status") {
          await pool.query(`UPDATE assets SET status=? WHERE id IN (${placeholders})`, [value, ...ids]);
        } else if (action === "condition") {
          await pool.query(`UPDATE assets SET \`condition\`=? WHERE id IN (${placeholders})`, [value, ...ids]);
        } else {
          return res.status(400).json({ error: "Unknown bulk action" });
        }
        res.json({ success: true, affected: ids.length });
      } catch (e) { console.error(e); res.status(500).json({ error: "Bulk operation failed" }); }
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CHECKOUT / CHECKIN
    // ══════════════════════════════════════════════════════════════════════════

    async checkoutAsset(req, res) {
      try {
        const { id } = req.params;
        const { assigned_to_user_id, assigned_to_org_id, location, notes } = req.body;
        const actorId = req.user?.id;

        // Check no active checkout
        const [[active]] = await pool.query(
          `SELECT id FROM asset_assignments WHERE asset_id=? AND checked_in_at IS NULL LIMIT 1`,
          [id]
        );
        if (active) return res.status(400).json({ error: "Asset is already checked out" });

        // Update asset assignment fields
        await pool.query(
          `UPDATE assets SET assigned_to_user_id=?, assigned_to_org_id=?, location=?, status='active' WHERE id=?`,
          [assigned_to_user_id || null, assigned_to_org_id || null, location, id]
        );

        // Log history
        await pool.query(
          `INSERT INTO asset_assignments (asset_id, assigned_to_user_id, assigned_to_org_id, location, notes, checked_out_by)
           VALUES (?,?,?,?,?,?)`,
          [id, assigned_to_user_id || null, assigned_to_org_id || null, location, notes, actorId]
        );

        res.json({ success: true });
      } catch (e) { console.error(e); res.status(500).json({ error: "Checkout failed" }); }
    },

    async checkinAsset(req, res) {
      try {
        const { id } = req.params;
        const { notes } = req.body;
        const actorId = req.user?.id;

        // Close active assignment
        await pool.query(
          `UPDATE asset_assignments SET checked_in_at=NOW(), checked_in_by=? WHERE asset_id=? AND checked_in_at IS NULL`,
          [actorId, id]
        );

        // Clear assignment on asset
        await pool.query(
          `UPDATE assets SET assigned_to_user_id=NULL, assigned_to_org_id=NULL WHERE id=?`,
          [id]
        );

        res.json({ success: true });
      } catch (e) { console.error(e); res.status(500).json({ error: "Check-in failed" }); }
    },

    // ══════════════════════════════════════════════════════════════════════════
    // ASSIGNMENT HISTORY
    // ══════════════════════════════════════════════════════════════════════════

    async getAssignments(req, res) {
      try {
        const { asset_id, active_only } = req.query;
        let where = "WHERE 1=1";
        const p = [];
        if (asset_id)   { where += " AND aa.asset_id=?"; p.push(asset_id); }
        if (active_only === "true") { where += " AND aa.checked_in_at IS NULL"; }

        const [rows] = await pool.query(`
          SELECT aa.*,
                 a.name AS asset_name, a.asset_tag,
                 at.name AS type_name,
                 u.full_name AS assigned_user_name,
                 o.name AS assigned_org_name,
                 ob.full_name AS checked_out_by_name,
                 ib.full_name AS checked_in_by_name
          FROM asset_assignments aa
          JOIN assets a ON a.id = aa.asset_id
          LEFT JOIN asset_types at ON at.id = a.asset_type_id
          LEFT JOIN users u ON u.id = aa.assigned_to_user_id
          LEFT JOIN organizations o ON o.id = aa.assigned_to_org_id
          LEFT JOIN users ob ON ob.id = aa.checked_out_by
          LEFT JOIN users ib ON ib.id = aa.checked_in_by
          ${where}
          ORDER BY aa.checked_out_at DESC
          LIMIT 500
        `, p);
        res.json(rows);
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch assignments" }); }
    },

    async getAssetAssignments(req, res) {
      try {
        const [rows] = await pool.query(`
          SELECT aa.*,
                 u.full_name AS assigned_user_name,
                 o.name AS assigned_org_name,
                 ob.full_name AS checked_out_by_name,
                 ib.full_name AS checked_in_by_name
          FROM asset_assignments aa
          LEFT JOIN users u ON u.id = aa.assigned_to_user_id
          LEFT JOIN organizations o ON o.id = aa.assigned_to_org_id
          LEFT JOIN users ob ON ob.id = aa.checked_out_by
          LEFT JOIN users ib ON ib.id = aa.checked_in_by
          WHERE aa.asset_id=?
          ORDER BY aa.checked_out_at DESC
        `, [req.params.id]);
        res.json(rows);
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch asset assignments" }); }
    },

    // ══════════════════════════════════════════════════════════════════════════
    // MAINTENANCE
    // ══════════════════════════════════════════════════════════════════════════

    async getMaintenance(req, res) {
      try {
        const { asset_id, status, type } = req.query;
        let where = "WHERE 1=1";
        const p = [];
        if (asset_id) { where += " AND am.asset_id=?"; p.push(asset_id); }
        if (status)   { where += " AND am.status=?";   p.push(status); }
        if (type)     { where += " AND am.maintenance_type=?"; p.push(type); }

        const [rows] = await pool.query(`
          SELECT am.*,
                 a.name AS asset_name, a.asset_tag,
                 at.name AS type_name,
                 u.full_name AS created_by_name
          FROM asset_maintenance am
          JOIN assets a ON a.id = am.asset_id
          LEFT JOIN asset_types at ON at.id = a.asset_type_id
          LEFT JOIN users u ON u.id = am.created_by
          ${where}
          ORDER BY COALESCE(am.scheduled_date, am.created_at) DESC
          LIMIT 500
        `, p);
        res.json(rows);
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch maintenance" }); }
    },

    async getAssetMaintenance(req, res) {
      try {
        const [rows] = await pool.query(`
          SELECT am.*, u.full_name AS created_by_name
          FROM asset_maintenance am
          LEFT JOIN users u ON u.id = am.created_by
          WHERE am.asset_id=?
          ORDER BY am.created_at DESC
        `, [req.params.id]);
        res.json(rows);
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch asset maintenance" }); }
    },

    async createMaintenance(req, res) {
      try {
        const {
          asset_id, title, maintenance_type = "preventive", status = "scheduled",
          scheduled_date, cost, technician, notes,
        } = req.body;
        if (!asset_id || !title) return res.status(400).json({ error: "asset_id and title required" });

        // If in_progress/scheduled, set asset to maintenance status
        if (["scheduled", "in_progress"].includes(status)) {
          await pool.query(`UPDATE assets SET status='maintenance' WHERE id=?`, [asset_id]);
        }

        const [r] = await pool.query(`
          INSERT INTO asset_maintenance (asset_id, title, maintenance_type, status, scheduled_date, cost, technician, notes, created_by)
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [asset_id, title, maintenance_type, status, scheduled_date || null, cost || null, technician, notes, req.user?.id]
        );
        res.status(201).json({ id: r.insertId });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to create maintenance" }); }
    },

    async updateMaintenance(req, res) {
      try {
        const { id } = req.params;
        const { title, maintenance_type, status, scheduled_date, completed_date, cost, technician, notes } = req.body;

        await pool.query(`
          UPDATE asset_maintenance SET title=?, maintenance_type=?, status=?, scheduled_date=?,
            completed_date=?, cost=?, technician=?, notes=?
          WHERE id=?`,
          [title, maintenance_type, status, scheduled_date || null, completed_date || null, cost || null, technician, notes, id]
        );

        // If completed/cancelled, set asset back to active
        if (["completed", "cancelled"].includes(status)) {
          const [[{ asset_id }]] = await pool.query(`SELECT asset_id FROM asset_maintenance WHERE id=?`, [id]);
          await pool.query(`UPDATE assets SET status='active' WHERE id=? AND status='maintenance'`, [asset_id]);
        }

        res.json({ id: Number(id) });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to update maintenance" }); }
    },

    async deleteMaintenance(req, res) {
      try {
        await pool.query(`DELETE FROM asset_maintenance WHERE id=?`, [req.params.id]);
        res.json({ success: true });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to delete maintenance" }); }
    },

    // ══════════════════════════════════════════════════════════════════════════
    // STATS / REPORTS
    // ══════════════════════════════════════════════════════════════════════════

    async getAssetStats(req, res) {
      try {
        const [[totals]] = await pool.query(`
          SELECT
            COUNT(*) AS total,
            SUM(status='active') AS active,
            SUM(status='maintenance') AS maintenance,
            SUM(status='retired') AS retired,
            SUM(status='inactive') AS inactive,
            SUM(assigned_to_user_id IS NOT NULL OR assigned_to_org_id IS NOT NULL) AS assigned,
            SUM(assigned_to_user_id IS NULL AND assigned_to_org_id IS NULL) AS unassigned,
            SUM(COALESCE(purchase_cost, 0)) AS total_cost,
            SUM(COALESCE(current_value, 0)) AS total_current_value
          FROM assets
        `);

        const [byCategory] = await pool.query(`
          SELECT ac.name, ac.icon, ac.color, COUNT(a.id) AS count
          FROM asset_categories ac
          LEFT JOIN assets a ON a.category_id = ac.id
          GROUP BY ac.id ORDER BY count DESC
        `);

        const [byType] = await pool.query(`
          SELECT at.name, at.icon, COUNT(a.id) AS count
          FROM asset_types at
          LEFT JOIN assets a ON a.asset_type_id = at.id
          GROUP BY at.id ORDER BY count DESC LIMIT 10
        `);

        const [byStatus] = await pool.query(`
          SELECT status, COUNT(*) AS count FROM assets GROUP BY status
        `);

        const [warrantyExpiring] = await pool.query(`
          SELECT a.id, a.name, a.asset_tag, at.name AS type_name,
                 a.warranty_expiry_date,
                 DATEDIFF(a.warranty_expiry_date, CURDATE()) AS days_remaining
          FROM assets a
          LEFT JOIN asset_types at ON a.asset_type_id = at.id
          WHERE a.warranty_expiry_date IS NOT NULL
            AND a.warranty_expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
          ORDER BY a.warranty_expiry_date ASC
          LIMIT 20
        `);

        const [recentMaintenance] = await pool.query(`
          SELECT am.*, a.name AS asset_name, a.asset_tag
          FROM asset_maintenance am
          JOIN assets a ON a.id = am.asset_id
          WHERE am.status IN ('scheduled','in_progress')
          ORDER BY am.scheduled_date ASC LIMIT 10
        `);

        const [linkedToTickets] = await pool.query(`
          SELECT COUNT(DISTINCT asset_id) AS count FROM asset_ticket_links
        `);

        res.json({
          totals,
          byCategory,
          byType,
          byStatus,
          warrantyExpiring,
          recentMaintenance,
          linkedToTickets: linkedToTickets[0]?.count || 0,
        });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch stats" }); }
    },

    // ══════════════════════════════════════════════════════════════════════════
    // TICKET LINKS (existing)
    // ══════════════════════════════════════════════════════════════════════════

    async linkAssetToTicket(req, res) {
      try {
        const { assetId, ticketId } = req.body;
        await pool.query(
          `INSERT INTO asset_ticket_links (asset_id, ticket_id) VALUES (?,?) ON DUPLICATE KEY UPDATE asset_id=asset_id`,
          [assetId, ticketId]
        );
        res.json({ success: true });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to link asset" }); }
    },

    async unlinkAssetFromTicket(req, res) {
      try {
        const { assetId, ticketId } = req.body;
        await pool.query(`DELETE FROM asset_ticket_links WHERE asset_id=? AND ticket_id=?`, [assetId, ticketId]);
        res.json({ success: true });
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to unlink asset" }); }
    },

    async getAssetTickets(req, res) {
      try {
        const [rows] = await pool.query(`
          SELECT t.*, s.label AS status_label, s.color AS status_color,
                 p.label AS priority_label, p.color AS priority_color
          FROM asset_ticket_links atl
          JOIN tickets t ON atl.ticket_id = t.id
          LEFT JOIN ticket_statuses s ON t.status_id = s.id
          LEFT JOIN ticket_priorities p ON t.priority_id = p.id
          WHERE atl.asset_id=?
          ORDER BY t.created_at DESC`,
          [req.params.id]
        );
        res.json(rows);
      } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch asset tickets" }); }
    },
  };
}
