// src/middleware/auth.js
import jwt from "jsonwebtoken";

// ── Session revocation ─────────────────────────────────────────────────────
// A JWT is self-contained, so on its own it stays valid for its full 8 hours no
// matter what happens to the account. That makes a password reset meaningless
// as a response to a compromised account, and lets a deactivated or deleted
// user keep working until their token runs out.
//
// So after verifying the signature we also check the account row: it must
// still exist and be active, and the token must have been issued AFTER the
// last password change. The row is cached briefly per user to keep this off
// the hot path; code that changes those fields calls forgetSession() so the
// change applies on the very next request rather than after the TTL. (That
// explicit invalidation is exact because the API runs as a single process —
// see ecosystem.config.cjs. With several processes the TTL is the bound.)

let authPool = null;
const SESSION_CACHE_MS = 30 * 1000;
const sessionCache = new Map(); // userId -> { active, changedAt (unix s | null), fetchedAt }

/** Called once from server.js. Until set, only the JWT signature is checked. */
export function setAuthPool(pool) {
  authPool = pool;
}

/** Drop a user's cached account state — call after changing password/status. */
export function forgetSession(userId) {
  sessionCache.delete(Number(userId));
}

async function getSessionState(userId) {
  const id = Number(userId);
  const hit = sessionCache.get(id);
  if (hit && Date.now() - hit.fetchedAt < SESSION_CACHE_MS) return hit;

  // UNIX_TIMESTAMP interprets the DATETIME in the MySQL session time zone —
  // the same zone NOW() wrote it in — so this comparison doesn't depend on the
  // Node process and the database agreeing about time zones.
  let rows;
  try {
    [rows] = await authPool.query(
      "SELECT is_active, UNIX_TIMESTAMP(password_changed_at) AS changed_at FROM users WHERE id = ?",
      [id]
    );
  } catch (err) {
    // deploy.sh only warns when a migration fails and carries on, so the
    // column can be missing on a half-upgraded server. Failing closed here
    // would lock every user out; degrade to the active check instead.
    if (err.code !== "ER_BAD_FIELD_ERROR") throw err;
    if (!getSessionState.warned) {
      console.error("[Auth] users.password_changed_at missing — run password-reset-migration.js. Password resets won't sign out old sessions until then.");
      getSessionState.warned = true;
    }
    [rows] = await authPool.query("SELECT is_active, NULL AS changed_at FROM users WHERE id = ?", [id]);
  }
  const state = rows.length
    ? { active: !!rows[0].is_active, changedAt: rows[0].changed_at == null ? null : Number(rows[0].changed_at), fetchedAt: Date.now() }
    : { active: false, changedAt: null, fetchedAt: Date.now() };

  sessionCache.set(id, state);
  // Keep the map from growing without bound on a long-lived process.
  if (sessionCache.size > 5000) sessionCache.delete(sessionCache.keys().next().value);
  return state;
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET); // { id, email, roles, iat }
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (!authPool) {
    req.user = payload;
    return next();
  }

  getSessionState(payload.id)
    .then((state) => {
      if (!state.active) {
        return res.status(401).json({ error: "Your account is no longer active" });
      }
      // iat and changedAt are both whole seconds. A token minted in the same
      // second as the change is accepted — that's the fresh login right after
      // a reset, not a stale session.
      if (state.changedAt != null && payload.iat < state.changedAt) {
        return res.status(401).json({ error: "Your password was changed. Please sign in again." });
      }
      req.user = payload;
      next();
    })
    .catch((err) => {
      // Fail closed: if we can't confirm the account, don't let the request in.
      console.error("[Auth] session check failed:", err.message);
      res.status(503).json({ error: "Authentication temporarily unavailable" });
    });
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const allowed = roles.some((role) => userRoles.includes(role));
    if (!allowed) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

export function requireAgent(req, res, next) {
  return requireRole("admin", "agent")(req, res, next);
}

export function requireAdmin(req, res, next) {
  return requireRole("admin")(req, res, next);
}

// Alias for compatibility
export const verifyToken = requireAuth;
