// src/controllers/formController.js
// Customer-facing service forms (Google-Forms-style, one-time token links).
import crypto from "crypto";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  badReq: (res, msg) => res.status(400).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  gone: (res, msg = "No longer available") => res.status(410).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeForm(row) {
  return {
    ...row,
    fields_schema: parseJson(row.fields_schema, []),
  };
}

function normalizeInvite(row) {
  return {
    ...row,
    response_data: parseJson(row.response_data, null),
  };
}

const INPUT_TYPES = new Set([
  "text", "textarea", "richtext", "select", "multiselect", "checkbox_group",
  "radio", "number", "date", "daterange", "user_lookup",
]);

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v).every(isEmptyValue);
  return false;
}

async function logTicketEvent(pool, ticketId, actorId, eventType, payload) {
  await pool.query(
    `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
     VALUES (?, ?, ?, ?)`,
    [ticketId, actorId, eventType, JSON.stringify(payload || {})]
  );
}

export function makeFormController(pool) {
  return {
    // ── Admin: GET /api/forms ──
    list: async (req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT f.*, u.full_name AS created_by_name,
                  (SELECT COUNT(*) FROM form_invites i WHERE i.form_id = f.id AND i.status <> 'revoked') AS invite_count,
                  (SELECT COUNT(*) FROM form_invites i WHERE i.form_id = f.id AND i.status = 'completed') AS completed_count
           FROM service_forms f
           LEFT JOIN users u ON u.id = f.created_by
           WHERE f.status = 'active'
           ORDER BY f.updated_at DESC`
        );
        return send.ok(res, { forms: rows.map(normalizeForm) });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Admin: POST /api/forms ──
    create: async (req, res) => {
      try {
        const { name, description, fields_schema } = req.body;
        if (!name || !String(name).trim()) return send.badReq(res, "Form name is required");
        const schema = Array.isArray(fields_schema) ? fields_schema : [];
        const [result] = await pool.query(
          `INSERT INTO service_forms (name, description, fields_schema, created_by)
           VALUES (?, ?, ?, ?)`,
          [String(name).trim(), description || null, JSON.stringify(schema), req.user.id]
        );
        return send.created(res, { id: result.insertId });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Admin: GET /api/forms/:id ──
    getOne: async (req, res) => {
      try {
        const [rows] = await pool.query(`SELECT * FROM service_forms WHERE id = ?`, [req.params.id]);
        if (!rows.length) return send.notFound(res, "Form not found");
        const [invites] = await pool.query(
          `SELECT i.id, i.token, i.recipient_email, i.recipient_name, i.recipient_user_id,
                  i.status, i.submitted_at, i.expires_at, i.created_at, i.ticket_id,
                  u.full_name AS recipient_user_name,
                  t.ticket_number AS ticket_number
           FROM form_invites i
           LEFT JOIN users u ON u.id = i.recipient_user_id
           LEFT JOIN tickets t ON t.id = i.ticket_id
           WHERE i.form_id = ?
           ORDER BY i.created_at DESC`,
          [req.params.id]
        );
        return send.ok(res, { form: normalizeForm(rows[0]), invites });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Admin: PUT /api/forms/:id ──
    update: async (req, res) => {
      try {
        const { name, description, fields_schema } = req.body;
        if (!name || !String(name).trim()) return send.badReq(res, "Form name is required");
        const schema = Array.isArray(fields_schema) ? fields_schema : [];
        const [result] = await pool.query(
          `UPDATE service_forms SET name = ?, description = ?, fields_schema = ? WHERE id = ?`,
          [String(name).trim(), description || null, JSON.stringify(schema), req.params.id]
        );
        if (!result.affectedRows) return send.notFound(res, "Form not found");
        return send.ok(res, { id: Number(req.params.id) });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Admin: DELETE /api/forms/:id (archives; invites stay for audit) ──
    remove: async (req, res) => {
      try {
        const [result] = await pool.query(
          `UPDATE service_forms SET status = 'archived' WHERE id = ?`,
          [req.params.id]
        );
        if (!result.affectedRows) return send.notFound(res, "Form not found");
        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Admin: POST /api/forms/:id/invites ──
    createInvite: async (req, res) => {
      try {
        const { email, name, expires_in_days, ticket_id } = req.body;
        const cleanEmail = String(email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          return send.badReq(res, "A valid recipient email is required");
        }
        const [forms] = await pool.query(
          `SELECT id, name FROM service_forms WHERE id = ? AND status = 'active'`,
          [req.params.id]
        );
        if (!forms.length) return send.notFound(res, "Form not found");

        // Optional ticket linkage — validates the ticket exists
        let ticket = null;
        if (ticket_id) {
          const [tickets] = await pool.query(
            `SELECT id, ticket_number FROM tickets WHERE id = ?`,
            [ticket_id]
          );
          if (!tickets.length) return send.badReq(res, "Linked ticket not found");
          ticket = tickets[0];
        }

        // Link to an existing user when the email matches one
        const [users] = await pool.query(
          `SELECT id, full_name FROM users WHERE LOWER(email) = ? LIMIT 1`,
          [cleanEmail]
        );
        const user = users[0] || null;

        const token = crypto.randomBytes(24).toString("hex");
        const days = Number(expires_in_days);
        const expiresAt = Number.isFinite(days) && days > 0
          ? new Date(Date.now() + days * 86400000)
          : null;

        const [result] = await pool.query(
          `INSERT INTO form_invites
             (form_id, token, recipient_email, recipient_name, recipient_user_id, ticket_id, expires_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            forms[0].id,
            token,
            cleanEmail,
            (name && String(name).trim()) || user?.full_name || null,
            user?.id || null,
            ticket?.id || null,
            expiresAt,
            req.user.id,
          ]
        );

        // Surface the send in the ticket's activity trail
        if (ticket) {
          await logTicketEvent(pool, ticket.id, req.user.id, "form.sent", {
            invite_id: result.insertId,
            form_id: forms[0].id,
            form_name: forms[0].name,
            recipient_email: cleanEmail,
          });
        }

        return send.created(res, {
          id: result.insertId,
          token,
          link_path: `/f/${token}`,
          recipient_email: cleanEmail,
          recipient_user_id: user?.id || null,
          ticket_id: ticket?.id || null,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Admin: GET /api/tickets/:ticketId/forms (invites linked to a ticket) ──
    ticketInvites: async (req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT i.id, i.token, i.recipient_email, i.recipient_name, i.recipient_user_id,
                  i.status, i.response_data, i.submitted_at, i.created_at,
                  f.id AS form_id, f.name AS form_name, f.fields_schema
           FROM form_invites i
           INNER JOIN service_forms f ON f.id = i.form_id
           WHERE i.ticket_id = ?
           ORDER BY i.created_at DESC`,
          [req.params.ticketId]
        );
        return send.ok(res, {
          invites: rows.map((r) => ({
            ...normalizeInvite(r),
            fields_schema: parseJson(r.fields_schema, []),
          })),
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Admin: DELETE /api/forms/invites/:inviteId ──
    revokeInvite: async (req, res) => {
      try {
        const [result] = await pool.query(
          `UPDATE form_invites SET status = 'revoked' WHERE id = ? AND status = 'pending'`,
          [req.params.inviteId]
        );
        if (!result.affectedRows) return send.badReq(res, "Only pending invites can be revoked");
        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Admin: GET /api/forms/:id/submissions ──
    submissions: async (req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT i.id, i.recipient_email, i.recipient_name, i.recipient_user_id,
                  i.response_data, i.submitted_at, i.created_at, i.ticket_id,
                  u.full_name AS recipient_user_name,
                  t.ticket_number AS ticket_number
           FROM form_invites i
           LEFT JOIN users u ON u.id = i.recipient_user_id
           LEFT JOIN tickets t ON t.id = i.ticket_id
           WHERE i.form_id = ? AND i.status = 'completed'
           ORDER BY i.submitted_at DESC`,
          [req.params.id]
        );
        return send.ok(res, { submissions: rows.map(normalizeInvite) });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Public: GET /api/public/forms/:token (no auth) ──
    publicGet: async (req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT i.id AS invite_id, i.status AS invite_status, i.recipient_email,
                  i.recipient_name, i.expires_at, i.submitted_at,
                  f.id AS form_id, f.name, f.description, f.fields_schema, f.status AS form_status
           FROM form_invites i
           INNER JOIN service_forms f ON f.id = i.form_id
           WHERE i.token = ?`,
          [req.params.token]
        );
        if (!rows.length) return send.notFound(res, "This form link is invalid");
        const row = rows[0];
        if (row.form_status !== "active" || row.invite_status === "revoked") {
          return send.gone(res, "This form link has been deactivated");
        }
        if (row.invite_status === "completed") {
          return send.ok(res, {
            state: "completed",
            form: { name: row.name, description: row.description },
            submitted_at: row.submitted_at,
          });
        }
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
          return send.gone(res, "This form link has expired");
        }
        return send.ok(res, {
          state: "active",
          form: {
            name: row.name,
            description: row.description,
            fields_schema: parseJson(row.fields_schema, []),
          },
          recipient: { email: row.recipient_email, name: row.recipient_name },
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ── Public: POST /api/public/forms/:token/submit (no auth, one-time) ──
    publicSubmit: async (req, res) => {
      try {
        const responses = req.body?.responses;
        if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
          return send.badReq(res, "Form responses are required");
        }
        const [rows] = await pool.query(
          `SELECT i.id, i.status, i.expires_at, i.ticket_id, i.recipient_email,
                  f.name AS form_name, f.fields_schema, f.status AS form_status
           FROM form_invites i
           INNER JOIN service_forms f ON f.id = i.form_id
           WHERE i.token = ?`,
          [req.params.token]
        );
        if (!rows.length) return send.notFound(res, "This form link is invalid");
        const invite = rows[0];
        if (invite.form_status !== "active" || invite.status === "revoked") {
          return send.gone(res, "This form link has been deactivated");
        }
        if (invite.status === "completed") {
          return send.badReq(res, "This form has already been submitted");
        }
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
          return send.gone(res, "This form link has expired");
        }

        // Server-side required-field validation (skips conditionally shown fields)
        const schema = parseJson(invite.fields_schema, []);
        const missing = schema.filter((f) =>
          INPUT_TYPES.has(f.type) &&
          f.required &&
          !(Array.isArray(f.conditions) && f.conditions.length > 0) &&
          isEmptyValue(responses[f.id])
        );
        if (missing.length) {
          return send.badReq(
            res,
            `Please complete all required fields (${missing.length} missing)`
          );
        }

        // One-time guard: only flips if still pending (atomic)
        const [result] = await pool.query(
          `UPDATE form_invites
           SET status = 'completed', response_data = ?, submitted_at = NOW()
           WHERE id = ? AND status = 'pending'`,
          [JSON.stringify(responses), invite.id]
        );
        if (!result.affectedRows) {
          return send.badReq(res, "This form has already been submitted");
        }

        // ── Ticket workflow integration ──
        // Log the completion on the linked ticket and, if the ticket was parked
        // "on_hold" (waiting on the customer form), resume it to in_progress.
        if (invite.ticket_id) {
          try {
            const payload = {
              invite_id: invite.id,
              form_name: invite.form_name,
              recipient_email: invite.recipient_email,
            };
            const [tickets] = await pool.query(
              `SELECT t.id, t.status_id, s.\`key\` AS status_key
               FROM tickets t INNER JOIN ticket_statuses s ON s.id = t.status_id
               WHERE t.id = ?`,
              [invite.ticket_id]
            );
            if (tickets.length && tickets[0].status_key === "on_hold") {
              const [inProgressStatus] = await pool.query(
                `SELECT id FROM ticket_statuses WHERE \`key\` = 'in_progress' LIMIT 1`
              );
              if (inProgressStatus.length) {
                await pool.query(`UPDATE tickets SET status_id = ? WHERE id = ?`, [
                  inProgressStatus[0].id,
                  invite.ticket_id,
                ]);
                payload.auto_reopened = true;
              }
            }
            await logTicketEvent(pool, invite.ticket_id, null, "form.completed", payload);
          } catch (linkErr) {
            // Never fail the customer's submission over ticket bookkeeping
            console.error("form.completed ticket integration failed:", linkErr);
          }
        }

        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
