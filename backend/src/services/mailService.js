// src/services/mailService.js
//
// Outbound mail. The SMTP configuration lives in the DB (smtp_settings, one
// row) rather than in env, so admins can repoint the relay from Settings →
// Email without a redeploy.
//
// The transport is cached because nodemailer pools connections, and rebuilding
// it per send would open a new TCP connection every time. The cache is keyed on
// the connection settings THEMSELVES, so any change to them — through the admin
// page or straight in SQL — rebuilds it on the next send. (It used to be keyed
// on updated_at, which has one-second resolution: two changes inside the same
// second left a transport pointing at the old port.)
import crypto from "crypto";
import nodemailer from "nodemailer";

let cached = null; // { key, transporter }

/** Reads the single settings row. Returns null when the table isn't migrated yet. */
export async function getSmtpSettings(pool) {
  try {
    const [rows] = await pool.query("SELECT * FROM smtp_settings WHERE id = 1");
    return rows[0] || null;
  } catch (err) {
    // Table missing (migration not run) shouldn't crash a ticket action.
    if (err.code === "ER_NO_SUCH_TABLE") return null;
    throw err;
  }
}

/**
 * Builds nodemailer transport options from a settings row.
 *
 * `secure: true` means implicit TLS (port 465). STARTTLS is NOT `secure: true` —
 * it's `secure: false` plus requireTLS, where the connection opens in plaintext
 * and upgrades. Conflating the two is the classic misconfiguration; hence the
 * three explicit branches.
 */
export function buildTransportOptions(s) {
  const opts = {
    host: s.host,
    port: Number(s.port),
    secure: s.security === "tls",
    // Relays on port 25 with no security frequently present a self-signed or
    // hostname-mismatched certificate if they offer STARTTLS at all. With
    // security='none' we must not let nodemailer opportunistically upgrade and
    // then fail the handshake — that turns a working relay into silent errors.
    ignoreTLS: s.security === "none",
    requireTLS: s.security === "starttls",
    // Generous on purpose. This relay does a reverse-DNS / ident lookup on
    // connect, so its banner can take ~15s to arrive from outside its own
    // network — a 10s greeting timeout reports a working relay as broken.
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 45000,
  };

  if (s.auth_required && s.username) {
    opts.auth = { user: s.username, pass: s.password || "" };
  }

  return opts;
}

/** Returns a live transporter, or null if mail is unconfigured/disabled. */
export async function getTransporter(pool) {
  const s = await getSmtpSettings(pool);
  if (!s || !s.enabled || !s.host) return null;

  // Hashed so the cache key never holds the SMTP password in plain form.
  const key = crypto
    .createHash("sha256")
    .update(JSON.stringify([s.host, s.port, s.security, s.auth_required, s.username, s.password]))
    .digest("hex");
  if (cached && cached.key === key) return cached.transporter;

  if (cached?.transporter) cached.transporter.close();
  const transporter = nodemailer.createTransport(buildTransportOptions(s));
  cached = { key, transporter, settings: s };
  return transporter;
}

/** Drops the cached transport — call after settings are written. */
export function invalidateTransport() {
  if (cached?.transporter) cached.transporter.close();
  cached = null;
}

/**
 * Sends an email. Never throws: mail is a side-effect of ticket actions, and a
 * dead relay must not roll back a ticket update or 500 the request. Returns
 * { sent, skipped?, error? } so callers can log without branching on exceptions.
 */
export async function sendMail(pool, { to, subject, text, html, cc, replyTo }) {
  try {
    const s = await getSmtpSettings(pool);
    if (!s || !s.enabled) return { sent: false, skipped: "mail disabled" };

    const transporter = await getTransporter(pool);
    if (!transporter) return { sent: false, skipped: "mail not configured" };

    const info = await transporter.sendMail({
      from: s.from_name ? `"${s.from_name}" <${s.from_email}>` : s.from_email,
      to: Array.isArray(to) ? to.join(", ") : to,
      cc: Array.isArray(cc) ? cc.join(", ") : cc,
      replyTo,
      subject,
      text,
      html,
    });

    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error("[Mail] send failed:", err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Opens a connection and runs the SMTP handshake without sending anything.
 * Used by the admin "Test connection" button. Unlike sendMail this reports the
 * failure verbatim — the admin is asking to be told what's broken.
 */
export async function verifyConnection(settings) {
  const transporter = nodemailer.createTransport(buildTransportOptions(settings));
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    transporter.close();
  }
}
