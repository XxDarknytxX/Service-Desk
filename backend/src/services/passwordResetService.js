// src/services/passwordResetService.js
//
// Emailed, single-use password reset links. Shared by the admin "Send password
// reset" action and the self-service "Forgot password?" flow — they differ only
// in who asks, how long the link lives, and whether the caller is told the
// outcome.
//
// Security properties this file is responsible for:
//   • The raw token never touches the database. We store its SHA-256; the raw
//     value exists only in the email. A leaked DB row can't be replayed.
//   • 256 bits of CSPRNG entropy, so guessing is not a meaningful attack and
//     the reset endpoint doesn't need its own lockout.
//   • Single use, enforced atomically: consumption is a conditional UPDATE whose
//     affectedRows decides the winner, so two concurrent submits of the same
//     link can't both set a password.
//   • Only the newest link works. Issuing one retires every earlier unused link
//     for that user.
//   • The link's origin comes from configuration (APP_URL), NEVER from the
//     request's Host header — trusting Host lets an attacker who triggers a
//     reset for a victim get the victim's token mailed pointing at their domain.
//   • The link carries the token in the URL FRAGMENT (#token=…). Fragments are
//     never sent to the server, so the token stays out of nginx access logs and
//     Referer headers; the page reads it client-side and POSTs it.
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendMail } from "./mailService.js";

export const RESET_TTL_MINUTES = {
  // An admin reset is often sent to someone who isn't at their desk — a day is
  // a reasonable window. Self-service is requested by the person who is about
  // to use it, so it's kept short.
  admin_reset: 24 * 60,
  self_service: 60,
  // A new account's first link: people often don't open a welcome email the
  // same day, and a resend is always available.
  onboarding: 72 * 60,
};

export const MIN_PASSWORD_LENGTH = 8;

// Self-service requests for the same account inside this window are silently
// dropped — stops someone from flooding a colleague's inbox with reset mail.
const SELF_SERVICE_COOLDOWN_SECONDS = 120;

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

export function getAppUrl() {
  const explicit = (process.env.APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  // Fall back to the configured CORS origin — still operator configuration,
  // never request-derived.
  const cors = (process.env.CORS_ORIGIN || "").split(",")[0].trim();
  return (cors || "http://localhost:3000").replace(/\/+$/, "");
}

/** Returns a human-readable problem with the password, or null if acceptable. */
export function validateNewPassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > 128) return "Password must be 128 characters or fewer";
  // bcrypt silently ignores everything past 72 bytes — two passwords sharing a
  // 72-byte prefix would be interchangeable. Refuse rather than truncate.
  if (Buffer.byteLength(password, "utf8") > 72) return "Password is too long";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number";
  }
  return null;
}

/**
 * Creates a reset token for a user. Earlier links are NOT retired here — that
 * waits until this one is actually delivered (see retireOlderTokens). Otherwise
 * a retry while the relay is down would kill the link the user already has and
 * leave them with nothing.
 * Returns { tokenId, rawToken, ttlMinutes, link }.
 */
async function issueToken(pool, { userId, purpose, requestedBy = null, requestIp = null }) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const ttl = RESET_TTL_MINUTES[purpose];

  const [result] = await pool.query(
    `INSERT INTO password_reset_tokens
       (user_id, token_hash, purpose, requested_by, request_ip, expires_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [userId, hashToken(rawToken), purpose, requestedBy, requestIp, ttl]
  );

  return {
    tokenId: result.insertId,
    rawToken,
    ttlMinutes: ttl,
    link: `${getAppUrl()}/reset-password#token=${rawToken}`,
  };
}

/**
 * Once a link has been delivered, it becomes the only one that works. Scoped to
 * ids BELOW the delivered one, so if two resets race, the newer link survives
 * rather than each retiring the other.
 */
async function retireOlderTokens(pool, userId, deliveredTokenId) {
  await pool.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND id < ? AND used_at IS NULL",
    [userId, deliveredTokenId]
  );
}

/** Removes a token we issued but couldn't deliver, so it can't linger unused. */
async function revokeToken(pool, tokenId) {
  await pool.query("DELETE FROM password_reset_tokens WHERE id = ?", [tokenId]);
}

// ── Email ───────────────────────────────────────────────────────────────────

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function describeTtl(minutes) {
  if (minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return days === 1 ? "24 hours" : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${minutes} minutes`;
}

/**
 * Table-based layout with inline styles: Outlook (which most Vodafone staff will
 * read this in) ignores <style> blocks, flexbox and most modern CSS.
 */
function layout({ heading, bodyHtml, preheader }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
      <tr><td style="background:#e60000;padding:20px 28px">
        <span style="color:#ffffff;font-size:17px;font-weight:600;letter-spacing:-0.2px">Vodafone Service Desk</span>
      </td></tr>
      <tr><td style="padding:32px 28px 8px">
        <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:600;color:#18181b">${escapeHtml(heading)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:20px 28px 28px">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;border-top:1px solid #e4e4e7;padding-top:16px">
          This is an automated message from the Vodafone Fiji Service Desk. Please do not reply to this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function resetEmail({ name, link, ttlMinutes, purpose }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const reason =
    purpose === "admin_reset"
      ? "A Service Desk administrator has requested a password reset for your account."
      : "We received a request to reset the password for your Service Desk account.";
  const ttl = describeTtl(ttlMinutes);
  const ignore =
    purpose === "admin_reset"
      ? "If you weren't expecting this, contact IT Support. Your current password keeps working until the new one is set."
      : "If you didn't request this, you can safely ignore this email — your password won't change.";

  const text = [
    greeting,
    "",
    reason,
    "",
    "Set a new password using the link below:",
    link,
    "",
    `This link can be used once and expires in ${ttl}.`,
    "",
    ignore,
    "",
    "— Vodafone Fiji Service Desk",
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6">${escapeHtml(reason)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
      <tr><td style="border-radius:8px;background:#e60000">
        <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">Set a new password</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#52525b">
      This link can be used once and expires in <strong>${escapeHtml(ttl)}</strong>.
    </p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#52525b">${escapeHtml(ignore)}</p>
    <p style="margin:0 0 6px;font-size:12px;color:#71717a">Button not working? Paste this address into your browser:</p>
    <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all"><a href="${escapeHtml(link)}" style="color:#e60000">${escapeHtml(link)}</a></p>`;

  return {
    subject: "Reset your Service Desk password",
    text,
    html: layout({ heading: "Reset your password", bodyHtml, preheader: "Set a new password for your Service Desk account." }),
  };
}

function onboardingEmail({ name, email, link, ttlMinutes, isCustomer, company }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const ttl = describeTtl(ttlMinutes);
  const intro = isCustomer
    ? `An account has been created for you on the Vodafone Fiji Business Service Desk${company ? ` for ${company}` : ""}. You can use it to raise and track service requests with our delivery teams.`
    : "An account has been created for you on the Vodafone Fiji Corporate Service Desk, where you'll triage and action corporate customers' requests.";

  const text = [
    greeting,
    "",
    intro,
    "",
    `Your sign-in email is: ${email}`,
    "",
    "Set your password to activate your account:",
    link,
    "",
    `This link can be used once and expires in ${ttl}. If it expires, ask your Vodafone contact to resend your invitation.`,
    "",
    "— Vodafone Fiji Service Desk",
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escapeHtml(intro)}</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b">Your sign-in email is <strong style="color:#18181b">${escapeHtml(email)}</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
      <tr><td style="border-radius:8px;background:#e60000">
        <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">Set your password</a>
      </td></tr>
    </table>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#52525b">
      This link can be used once and expires in <strong>${escapeHtml(ttl)}</strong>. If it expires, ask your Vodafone contact to resend your invitation.
    </p>
    <p style="margin:0 0 6px;font-size:12px;color:#71717a">Button not working? Paste this address into your browser:</p>
    <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all"><a href="${escapeHtml(link)}" style="color:#e60000">${escapeHtml(link)}</a></p>`;

  return {
    subject: isCustomer ? "Your Vodafone Business Service Desk account" : "Welcome to the Vodafone Corporate Service Desk",
    text,
    html: layout({ heading: "Activate your account", bodyHtml, preheader: "Set your password to start using the Service Desk." }),
  };
}

function changedEmail({ name, email }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const when = new Date().toLocaleString("en-FJ", { timeZone: "Pacific/Fiji", dateStyle: "medium", timeStyle: "short" });
  const text = [
    greeting,
    "",
    `The password for your Service Desk account (${email}) was changed on ${when} (Fiji time).`,
    "All existing sessions have been signed out.",
    "",
    "If you made this change, no action is needed.",
    "If you didn't, contact IT Support immediately.",
    "",
    "— Vodafone Fiji Service Desk",
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">
      The password for your Service Desk account (<strong>${escapeHtml(email)}</strong>) was changed on
      <strong>${escapeHtml(when)}</strong> (Fiji time). All existing sessions have been signed out.
    </p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#52525b">If you made this change, no action is needed.</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#b91c1c;font-weight:600">If you didn't, contact IT Support immediately.</p>`;

  return {
    subject: "Your Service Desk password was changed",
    text,
    html: layout({ heading: "Password changed", bodyHtml, preheader: "Your Service Desk password was just changed." }),
  };
}

// ── Public flows ────────────────────────────────────────────────────────────

/**
 * Admin-initiated reset. Awaits delivery and reports it truthfully: the admin
 * needs to know whether the user actually got the link.
 * Returns { ok: true, email, ttlMinutes } or { ok: false, status, error }.
 */
export async function sendAdminReset(pool, { userId, adminId, requestIp }) {
  return sendAccountEmail(pool, { userId, actorId: adminId, requestIp, purpose: "admin_reset" });
}

/**
 * Onboarding invitation for a newly created account (or a resend). Only valid
 * while the account is still waiting for its first password — an activated
 * account gets a password reset instead.
 */
export async function sendOnboarding(pool, { userId, actorId, requestIp }) {
  return sendAccountEmail(pool, { userId, actorId, requestIp, purpose: "onboarding" });
}

async function sendAccountEmail(pool, { userId, actorId, requestIp, purpose }) {
  const [[user]] = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.company, u.is_active, u.must_set_password,
            EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = u.id AND r.name = 'corporate_customer') AS is_customer
       FROM users u WHERE u.id = ?`,
    [userId]
  );
  if (!user) return { ok: false, status: 404, error: "User not found" };
  if (!user.is_active) {
    return {
      ok: false, status: 400,
      error: `This account is deactivated. Activate it before sending ${purpose === "onboarding" ? "an onboarding email" : "a password reset"}.`,
    };
  }
  if (purpose === "onboarding" && !user.must_set_password) {
    return { ok: false, status: 400, error: "This account is already activated — send a password reset instead." };
  }

  const { tokenId, link, ttlMinutes } = await issueToken(pool, {
    userId: user.id,
    purpose,
    requestedBy: actorId,
    requestIp,
  });

  const mail = purpose === "onboarding"
    ? onboardingEmail({ name: user.full_name, email: user.email, link, ttlMinutes, isCustomer: !!user.is_customer, company: user.company })
    : resetEmail({ name: user.full_name, link, ttlMinutes, purpose: "admin_reset" });
  const result = await sendMail(pool, { to: user.email, ...mail });

  if (!result.sent) {
    // An undelivered link is useless to the user and a liability at rest. Any
    // link they received earlier is left working.
    await revokeToken(pool, tokenId);
    const reason = result.skipped
      ? "Outbound email is turned off or not configured — check Settings → Email Settings."
      : `The email could not be sent: ${result.error}`;
    return { ok: false, status: 502, error: reason };
  }

  await retireOlderTokens(pool, user.id, tokenId);
  return { ok: true, email: user.email, ttlMinutes };
}

/**
 * Self-service "Forgot password?". Deliberately returns nothing — the HTTP
 * handler replies identically whether or not the address exists, and does NOT
 * await this function, so response timing can't reveal which emails have
 * accounts either (a real send takes seconds; an unknown address takes none).
 */
export async function sendSelfServiceReset(pool, { email, requestIp }) {
  try {
    const [[user]] = await pool.query(
      "SELECT id, email, full_name, is_active FROM users WHERE email = ?",
      [String(email || "").trim()]
    );
    if (!user || !user.is_active) return;

    const [[recent]] = await pool.query(
      `SELECT COUNT(*) AS n FROM password_reset_tokens
        WHERE user_id = ? AND purpose = 'self_service'
          AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [user.id, SELF_SERVICE_COOLDOWN_SECONDS]
    );
    if (recent.n > 0) return;

    const { tokenId, link, ttlMinutes } = await issueToken(pool, {
      userId: user.id,
      purpose: "self_service",
      requestIp,
    });

    const mail = resetEmail({ name: user.full_name, link, ttlMinutes, purpose: "self_service" });
    const result = await sendMail(pool, { to: user.email, ...mail });
    if (!result.sent) {
      await revokeToken(pool, tokenId);
      console.error(`[PasswordReset] self-service mail to user ${user.id} not sent:`, result.error || result.skipped);
      return;
    }
    await retireOlderTokens(pool, user.id, tokenId);
  } catch (err) {
    console.error("[PasswordReset] self-service request failed:", err.message);
  }
}

/**
 * Checks a token without consuming it, so the reset page can say "this link
 * has expired" before the user types a new password.
 * Returns { valid: true, email } or { valid: false }.
 */
export async function inspectToken(pool, rawToken) {
  if (typeof rawToken !== "string" || rawToken.length < 20 || rawToken.length > 200) {
    return { valid: false };
  }
  const [[row]] = await pool.query(
    `SELECT u.email, u.full_name, prt.purpose
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = ? AND prt.used_at IS NULL
        AND prt.expires_at > NOW() AND u.is_active = 1`,
    [hashToken(rawToken)]
  );
  // `purpose` lets the page greet a new user ("Set your password") rather than
  // talk about resetting a password they never had.
  return row ? { valid: true, email: row.email, name: row.full_name, purpose: row.purpose } : { valid: false };
}

/**
 * Consumes a token and sets the new password.
 * Returns { ok: true, userId } or { ok: false, status, error }.
 */
export async function completeReset(pool, { rawToken, password }) {
  const problem = validateNewPassword(password);
  if (problem) return { ok: false, status: 400, error: problem };

  if (typeof rawToken !== "string" || rawToken.length < 20 || rawToken.length > 200) {
    return { ok: false, status: 400, error: "This reset link is invalid or has expired." };
  }

  // Hash before taking a connection — bcrypt is deliberately slow and there's
  // no reason to hold a pooled connection and an open transaction through it.
  const passwordHash = await bcrypt.hash(password, 10);
  const tokenHash = hashToken(rawToken);

  const conn = await pool.getConnection();
  let user;
  try {
    await conn.beginTransaction();

    const [[row]] = await conn.query(
      `SELECT prt.id, prt.user_id, prt.purpose, u.email, u.full_name
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
        WHERE prt.token_hash = ? AND prt.used_at IS NULL
          AND prt.expires_at > NOW() AND u.is_active = 1
        FOR UPDATE`,
      [tokenHash]
    );
    if (!row) {
      await conn.rollback();
      return { ok: false, status: 400, error: "This reset link is invalid or has expired." };
    }

    // The conditional UPDATE is the single-use guarantee: if a concurrent
    // request already consumed this row, affectedRows is 0 and we stop.
    const [claim] = await conn.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL",
      [row.id]
    );
    if (claim.affectedRows !== 1) {
      await conn.rollback();
      return { ok: false, status: 400, error: "This reset link has already been used." };
    }

    await conn.query(
      "UPDATE users SET password_hash = ?, password_changed_at = NOW(), must_set_password = 0 WHERE id = ?",
      [passwordHash, row.user_id]
    );
    // Retire any other outstanding links for this account.
    await conn.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
      [row.user_id]
    );

    await conn.commit();
    user = row;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Security notice. Fire-and-forget: the password is already changed, and a
  // mail hiccup must not turn a successful reset into an error for the user.
  // Skipped for onboarding: the person just chose their first password and
  // was expecting it — "your password was changed" would read as an alarm.
  if (user.purpose !== "onboarding") sendMail(pool, { to: user.email, ...changedEmail({ name: user.full_name, email: user.email }) })
    .then((r) => {
      if (!r.sent) console.error(`[PasswordReset] change notice to user ${user.user_id} not sent:`, r.error || r.skipped);
    });

  return { ok: true, userId: user.user_id, purpose: user.purpose };
}
