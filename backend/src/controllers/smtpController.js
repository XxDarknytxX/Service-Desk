// src/controllers/smtpController.js
//
// Admin-facing CRUD for the single smtp_settings row, plus connection test and
// test-send. Every route here is admin-only (enforced in routes/smtp.js).
//
// The stored password is NEVER returned. GET substitutes a has_password
// boolean; PUT treats an omitted/unchanged password as "keep the existing one",
// so an admin can edit the host without re-typing the secret and without the
// UI needing to hold it.
import {
  invalidateTransport,
  verifyConnection,
  sendMail,
} from "../services/mailService.js";

const SECURITY_TYPES = ["none", "tls", "starttls"];

// Sentinel the frontend echoes back for "password unchanged". Using a sentinel
// rather than "empty means keep" lets an admin actually clear the password.
const UNCHANGED = "__UNCHANGED__";

function shape(row) {
  if (!row) return null;
  const { password, ...rest } = row;
  return { ...rest, has_password: !!password };
}

export function makeSmtpController(pool) {
  return {
    /** GET /api/settings/smtp — current config, password redacted. */
    async get(_req, res) {
      try {
        const [rows] = await pool.query("SELECT * FROM smtp_settings WHERE id = 1");
        if (!rows.length) {
          // Migration ran but the row was deleted, or a very old DB. Give the
          // UI a usable blank form instead of a 404 it has to special-case.
          return res.json({
            id: 1,
            host: "",
            port: 25,
            security: "none",
            auth_required: 0,
            username: null,
            from_email: "",
            from_name: "",
            enabled: 0,
            has_password: false,
            last_tested_at: null,
            last_test_ok: null,
            last_test_error: null,
          });
        }
        res.json(shape(rows[0]));
      } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
          return res.status(503).json({
            error: "Email settings table is missing. Run the smtp-settings migration.",
          });
        }
        console.error("getSmtpSettings error:", err);
        res.status(500).json({ error: "Failed to load email settings" });
      }
    },

    /** PUT /api/settings/smtp — replace the config. */
    async update(req, res) {
      try {
        const {
          host,
          port,
          security,
          auth_required,
          username,
          password,
          from_email,
          from_name,
          enabled,
        } = req.body || {};

        if (!host || !String(host).trim()) {
          return res.status(400).json({ error: "SMTP host is required" });
        }
        const portNum = Number(port);
        if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
          return res.status(400).json({ error: "Port must be between 1 and 65535" });
        }
        const sec = SECURITY_TYPES.includes(security) ? security : "none";
        const authOn = auth_required ? 1 : 0;
        if (authOn && !String(username || "").trim()) {
          return res.status(400).json({ error: "Username is required when authentication is on" });
        }
        if (!from_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(from_email).trim())) {
          return res.status(400).json({ error: "A valid 'From' email address is required" });
        }

        // Resolve the password: sentinel (or omitted) keeps what's stored.
        const [[existing]] = await pool.query(
          "SELECT password FROM smtp_settings WHERE id = 1"
        );
        let finalPassword;
        if (password === undefined || password === UNCHANGED) {
          finalPassword = existing?.password ?? null;
        } else {
          finalPassword = password === "" ? null : password;
        }
        // Auth off means the stored secret is dead weight — drop it rather than
        // leaving a credential at rest that nothing uses.
        if (!authOn) finalPassword = null;

        await pool.query(
          `INSERT INTO smtp_settings
             (id, host, port, security, auth_required, username, password,
              from_email, from_name, enabled, updated_by)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             host = VALUES(host), port = VALUES(port), security = VALUES(security),
             auth_required = VALUES(auth_required), username = VALUES(username),
             password = VALUES(password), from_email = VALUES(from_email),
             from_name = VALUES(from_name), enabled = VALUES(enabled),
             updated_by = VALUES(updated_by)`,
          [
            String(host).trim(),
            portNum,
            sec,
            authOn,
            authOn ? String(username).trim() : null,
            finalPassword,
            String(from_email).trim(),
            from_name ? String(from_name).trim() : null,
            enabled ? 1 : 0,
            req.user?.id ?? null,
          ]
        );

        invalidateTransport();

        const [rows] = await pool.query("SELECT * FROM smtp_settings WHERE id = 1");
        res.json(shape(rows[0]));
      } catch (err) {
        console.error("updateSmtpSettings error:", err);
        res.status(500).json({ error: "Failed to save email settings" });
      }
    },

    /**
     * POST /api/settings/smtp/test — SMTP handshake only, no message sent.
     *
     * Tests the SAVED config, not the form's current contents: testing unsaved
     * values would report success for a configuration that isn't live. The UI
     * saves first, then tests.
     */
    async test(req, res) {
      try {
        const [rows] = await pool.query("SELECT * FROM smtp_settings WHERE id = 1");
        if (!rows.length) return res.status(400).json({ error: "No email settings saved yet" });

        const result = await verifyConnection(rows[0]);

        await pool.query(
          `UPDATE smtp_settings
              SET last_tested_at = NOW(), last_test_ok = ?, last_test_error = ?
            WHERE id = 1`,
          [result.ok ? 1 : 0, result.ok ? null : result.error]
        );

        if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
        res.json({ ok: true, message: `Connected to ${rows[0].host}:${rows[0].port}` });
      } catch (err) {
        console.error("testSmtp error:", err);
        res.status(500).json({ error: "Connection test failed to run" });
      }
    },

    /** POST /api/settings/smtp/send-test — sends a real email to one address. */
    async sendTest(req, res) {
      try {
        const to = String(req.body?.to || "").trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
          return res.status(400).json({ error: "A valid recipient email is required" });
        }

        const result = await sendMail(pool, {
          to,
          subject: "Vodafone Service Desk — SMTP test",
          text:
            "This is a test message from the Vodafone Service Desk.\n\n" +
            "If you received it, outbound email is configured correctly.",
          html:
            '<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">' +
            "<p>This is a test message from the <strong>Vodafone Service Desk</strong>.</p>" +
            "<p>If you received it, outbound email is configured correctly.</p>" +
            "</div>",
        });

        if (!result.sent) {
          return res
            .status(400)
            .json({ ok: false, error: result.error || result.skipped || "Send failed" });
        }
        res.json({ ok: true, message: `Test email sent to ${to}` });
      } catch (err) {
        console.error("sendTestEmail error:", err);
        res.status(500).json({ error: "Failed to send test email" });
      }
    },
  };
}
