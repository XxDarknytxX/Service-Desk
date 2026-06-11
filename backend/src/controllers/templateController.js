// src/controllers/templateController.js
// Template management: categories, templates, gallery, responses

const VALID_FIELD_TYPES = [
  "text", "textarea", "richtext", "select", "multiselect",
  "checkbox_group", "radio", "number", "date", "daterange",
  "file_upload", "user_lookup", "section_header", "info_text",
  "divider", "hidden",
];

function validateFieldsSchema(schema) {
  if (!Array.isArray(schema)) return "fields_schema must be an array";
  const ids = new Set();
  for (const field of schema) {
    if (!field.id || !field.type) return `Every field must have an id and type`;
    if (ids.has(field.id)) return `Duplicate field id: ${field.id}`;
    ids.add(field.id);
    if (!VALID_FIELD_TYPES.includes(field.type)) return `Invalid field type: ${field.type}`;
  }
  return null;
}

const send = {
  ok: (res, data) => res.json(data),
  created: (res, data) => res.status(201).json(data),
  bad: (res, msg) => res.status(400).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, err) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
};

export function makeTemplateController(pool) {
  // ═══════════════════════════════════════
  //  CATEGORIES
  // ═══════════════════════════════════════

  async function getCategories(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT id, name, description, icon, sort_order, is_active,
                created_at, updated_at
         FROM ticket_template_categories
         ORDER BY sort_order, name`
      );
      send.ok(res, { categories: rows });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  async function createCategory(req, res) {
    try {
      const { name, description, icon, sort_order } = req.body;
      if (!name?.trim()) return send.bad(res, "Category name is required");

      const [result] = await pool.query(
        `INSERT INTO ticket_template_categories (name, description, icon, sort_order)
         VALUES (?, ?, ?, ?)`,
        [name.trim(), description || null, icon || "clipboard", sort_order || 0]
      );
      send.created(res, { id: result.insertId, message: "Category created" });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  async function updateCategory(req, res) {
    try {
      const { id } = req.params;
      const { name, description, icon, sort_order, is_active } = req.body;
      if (!name?.trim()) return send.bad(res, "Category name is required");

      const [result] = await pool.query(
        `UPDATE ticket_template_categories
         SET name = ?, description = ?, icon = ?, sort_order = ?, is_active = ?
         WHERE id = ?`,
        [name.trim(), description || null, icon || "clipboard", sort_order ?? 0, is_active ?? 1, id]
      );
      if (result.affectedRows === 0) return send.notFound(res, "Category not found");
      send.ok(res, { message: "Category updated" });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  async function deleteCategory(req, res) {
    try {
      const { id } = req.params;
      // Set templates in this category to uncategorized
      await pool.query("UPDATE ticket_templates SET category_id = NULL WHERE category_id = ?", [id]);
      const [result] = await pool.query("DELETE FROM ticket_template_categories WHERE id = ?", [id]);
      if (result.affectedRows === 0) return send.notFound(res, "Category not found");
      send.ok(res, { message: "Category deleted" });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  // ═══════════════════════════════════════
  //  TEMPLATES
  // ═══════════════════════════════════════

  async function getTemplates(req, res) {
    try {
      const { category_id, search, active_only } = req.query;
      let sql = `
        SELECT t.id, t.category_id, t.name, t.description, t.icon,
               t.fields_schema, t.default_subject, t.default_priority_key,
               t.default_type_key, t.default_channel_key, t.default_team_id,
               t.default_assignee_id, t.default_organization_id,
               t.standard_field_config, t.is_active, t.sort_order,
               t.usage_count, t.created_by, t.created_at, t.updated_at,
               c.name AS category_name, c.icon AS category_icon,
               u.full_name AS created_by_name
        FROM ticket_templates t
        LEFT JOIN ticket_template_categories c ON c.id = t.category_id
        LEFT JOIN users u ON u.id = t.created_by
        WHERE 1=1
      `;
      const params = [];

      if (active_only === "true" || active_only === "1") {
        sql += " AND t.is_active = 1";
      }
      if (category_id) {
        sql += " AND t.category_id = ?";
        params.push(Number(category_id));
      }
      if (search) {
        sql += " AND (t.name LIKE ? OR t.description LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += " ORDER BY t.sort_order, t.name";

      const [rows] = await pool.query(sql, params);

      // Parse JSON fields
      const templates = rows.map((r) => ({
        ...r,
        fields_schema: typeof r.fields_schema === "string" ? JSON.parse(r.fields_schema) : r.fields_schema,
        standard_field_config: r.standard_field_config
          ? typeof r.standard_field_config === "string" ? JSON.parse(r.standard_field_config) : r.standard_field_config
          : null,
      }));

      send.ok(res, { templates });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  async function getTemplate(req, res) {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        `SELECT t.*, c.name AS category_name, c.icon AS category_icon,
                u.full_name AS created_by_name
         FROM ticket_templates t
         LEFT JOIN ticket_template_categories c ON c.id = t.category_id
         LEFT JOIN users u ON u.id = t.created_by
         WHERE t.id = ?`,
        [id]
      );
      if (rows.length === 0) return send.notFound(res, "Template not found");

      const template = rows[0];
      template.fields_schema = typeof template.fields_schema === "string"
        ? JSON.parse(template.fields_schema) : template.fields_schema;
      template.standard_field_config = template.standard_field_config
        ? typeof template.standard_field_config === "string"
          ? JSON.parse(template.standard_field_config) : template.standard_field_config
        : null;

      send.ok(res, { template });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  async function createTemplate(req, res) {
    try {
      const {
        category_id, name, description, icon, fields_schema,
        default_subject, default_priority_key, default_type_key,
        default_channel_key, default_team_id, default_assignee_id,
        default_organization_id, standard_field_config, sort_order,
      } = req.body;

      if (!name?.trim()) return send.bad(res, "Template name is required");
      if (!fields_schema) return send.bad(res, "fields_schema is required");

      const schemaErr = validateFieldsSchema(fields_schema);
      if (schemaErr) return send.bad(res, schemaErr);

      const [result] = await pool.query(
        `INSERT INTO ticket_templates
         (category_id, name, description, icon, fields_schema,
          default_subject, default_priority_key, default_type_key,
          default_channel_key, default_team_id, default_assignee_id,
          default_organization_id, standard_field_config, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          category_id || null, name.trim(), description || null, icon || "fileText",
          JSON.stringify(fields_schema),
          default_subject || null, default_priority_key || null,
          default_type_key || null, default_channel_key || null,
          default_team_id || null, default_assignee_id || null,
          default_organization_id || null,
          standard_field_config ? JSON.stringify(standard_field_config) : null,
          sort_order || 0, req.user.id,
        ]
      );

      send.created(res, { id: result.insertId, message: "Template created" });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  async function updateTemplate(req, res) {
    try {
      const { id } = req.params;
      const {
        category_id, name, description, icon, fields_schema,
        default_subject, default_priority_key, default_type_key,
        default_channel_key, default_team_id, default_assignee_id,
        default_organization_id, standard_field_config, sort_order, is_active,
      } = req.body;

      if (!name?.trim()) return send.bad(res, "Template name is required");

      if (fields_schema) {
        const schemaErr = validateFieldsSchema(fields_schema);
        if (schemaErr) return send.bad(res, schemaErr);
      }

      const [result] = await pool.query(
        `UPDATE ticket_templates SET
          category_id = ?, name = ?, description = ?, icon = ?,
          fields_schema = ?, default_subject = ?, default_priority_key = ?,
          default_type_key = ?, default_channel_key = ?,
          default_team_id = ?, default_assignee_id = ?,
          default_organization_id = ?, standard_field_config = ?,
          sort_order = ?, is_active = ?
         WHERE id = ?`,
        [
          category_id || null, name.trim(), description || null, icon || "fileText",
          fields_schema ? JSON.stringify(fields_schema) : undefined,
          default_subject || null, default_priority_key || null,
          default_type_key || null, default_channel_key || null,
          default_team_id || null, default_assignee_id || null,
          default_organization_id || null,
          standard_field_config ? JSON.stringify(standard_field_config) : null,
          sort_order ?? 0, is_active ?? 1, id,
        ]
      );

      if (result.affectedRows === 0) return send.notFound(res, "Template not found");
      send.ok(res, { message: "Template updated" });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  async function deleteTemplate(req, res) {
    try {
      const { id } = req.params;
      const [result] = await pool.query("DELETE FROM ticket_templates WHERE id = ?", [id]);
      if (result.affectedRows === 0) return send.notFound(res, "Template not found");
      send.ok(res, { message: "Template deleted" });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  async function duplicateTemplate(req, res) {
    try {
      const { id } = req.params;
      const [rows] = await pool.query("SELECT * FROM ticket_templates WHERE id = ?", [id]);
      if (rows.length === 0) return send.notFound(res, "Template not found");

      const src = rows[0];
      const [result] = await pool.query(
        `INSERT INTO ticket_templates
         (category_id, name, description, icon, fields_schema,
          default_subject, default_priority_key, default_type_key,
          default_channel_key, default_team_id, default_assignee_id,
          default_organization_id, standard_field_config, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          src.category_id, `${src.name} (Copy)`, src.description, src.icon,
          src.fields_schema, src.default_subject, src.default_priority_key,
          src.default_type_key, src.default_channel_key, src.default_team_id,
          src.default_assignee_id, src.default_organization_id,
          src.standard_field_config, src.sort_order, req.user.id,
        ]
      );

      send.created(res, { id: result.insertId, message: "Template duplicated" });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  // ═══════════════════════════════════════
  //  GALLERY (for end-user ticket creation)
  // ═══════════════════════════════════════

  async function getTemplateGallery(req, res) {
    try {
      const { search } = req.query;

      // Get active categories
      const [categories] = await pool.query(
        `SELECT id, name, description, icon, sort_order
         FROM ticket_template_categories
         WHERE is_active = 1
         ORDER BY sort_order, name`
      );

      // Get active templates
      let templateSql = `
        SELECT id, category_id, name, description, icon, usage_count,
               default_subject, fields_schema, standard_field_config
        FROM ticket_templates
        WHERE is_active = 1
      `;
      const params = [];
      if (search) {
        templateSql += " AND (name LIKE ? OR description LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
      }
      templateSql += " ORDER BY sort_order, name";

      const [templates] = await pool.query(templateSql, params);

      // Parse JSON and compute field count
      const parsedTemplates = templates.map((t) => {
        const schema = typeof t.fields_schema === "string" ? JSON.parse(t.fields_schema) : t.fields_schema;
        const fieldCount = schema.filter((f) =>
          !["section_header", "info_text", "divider"].includes(f.type)
        ).length;
        return {
          id: t.id,
          category_id: t.category_id,
          name: t.name,
          description: t.description,
          icon: t.icon,
          usage_count: t.usage_count,
          field_count: fieldCount,
        };
      });

      // Group templates under categories
      const gallery = categories.map((cat) => ({
        ...cat,
        templates: parsedTemplates.filter((t) => t.category_id === cat.id),
      }));

      // Add uncategorized templates
      const uncategorized = parsedTemplates.filter((t) => !t.category_id);
      if (uncategorized.length > 0) {
        gallery.push({
          id: null,
          name: "Other",
          description: "Uncategorized templates",
          icon: "clipboard",
          templates: uncategorized,
        });
      }

      send.ok(res, { gallery });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  // ═══════════════════════════════════════
  //  TEMPLATE RESPONSES (per ticket)
  // ═══════════════════════════════════════

  async function getTicketTemplateResponse(req, res) {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        `SELECT tr.id, tr.ticket_id, tr.template_id, tr.response_data,
                tr.schema_snapshot, tr.created_at,
                t.name AS template_name, t.icon AS template_icon
         FROM ticket_template_responses tr
         LEFT JOIN ticket_templates t ON t.id = tr.template_id
         WHERE tr.ticket_id = ?`,
        [id]
      );
      if (rows.length === 0) return send.ok(res, { response: null });

      const row = rows[0];
      row.response_data = typeof row.response_data === "string"
        ? JSON.parse(row.response_data) : row.response_data;
      row.schema_snapshot = row.schema_snapshot
        ? typeof row.schema_snapshot === "string"
          ? JSON.parse(row.schema_snapshot) : row.schema_snapshot
        : null;

      send.ok(res, { response: row });
    } catch (err) {
      send.serverErr(res, err);
    }
  }

  return {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    getTemplateGallery,
    getTicketTemplateResponse,
  };
}
