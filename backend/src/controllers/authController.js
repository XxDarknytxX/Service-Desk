// src/controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { getUserRoles } from "../utils/roles.js";
import { forgetSession } from "../middleware/auth.js";
import { computeWorkspaceAccess } from "../middleware/workspace.js";
import {
  sendSelfServiceReset,
  inspectToken,
  completeReset,
  RESET_TTL_MINUTES,
  MIN_PASSWORD_LENGTH,
} from "../services/passwordResetService.js";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  unauthorized: (res, msg = "Unauthorized") => res.status(401).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

async function findUserByEmail(pool, email) {
  const [rows] = await pool.query(
    `SELECT id, email, password_hash, full_name, is_active, must_set_password
     FROM users WHERE email = ?`,
    [email]
  );
  return rows[0] || null;
}

async function findUserById(pool, id) {
  const [rows] = await pool.query(
    `SELECT id, email, full_name, is_active, created_at
     FROM users WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

// Fetch team membership + provisioned modules for a user
async function fetchTeamModules(pool, userId) {
  const [rows] = await pool.query(
    `SELECT tm.team_id, t.name AS team_name, tm.is_lead
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id
     WHERE tm.user_id = ?
     LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return { team_id: null, team_name: null, teamModules: null };

  const team = rows[0];
  const [accessRows] = await pool.query(
    `SELECT module_key FROM team_module_access WHERE team_id = ?`,
    [team.team_id]
  );

  // No rows in team_module_access → unrestricted (null)
  // Has rows → restricted to those specific modules
  return {
    team_id: team.team_id,
    team_name: team.team_name,
    teamModules: accessRows.length > 0 ? accessRows.map(r => r.module_key) : null,
  };
}

export function makeAuthController(pool) {
  return {
    // POST /api/auth/login
    login: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { email, password } = req.body;
      try {
        const user = await findUserByEmail(pool, email);
        if (!user) return send.bad(res, "Invalid credentials");
        if (!user.is_active) return send.unauthorized(res, "User disabled");

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
          // An invited account has a random password nobody knows — tell them how to
          // get in rather than letting them retry a password that can never work.
          if (user.must_set_password) {
            return send.bad(res, "Your account isn't activated yet. Use the link in your welcome email to set your password, or choose \"Forgot password?\".");
          }
          return send.bad(res, "Invalid credentials");
        }

        const roles = await getUserRoles(pool, user.id);
        const teamInfo = await fetchTeamModules(pool, user.id);
        const access = await computeWorkspaceAccess(pool, user.id, roles);
        await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

        const token = jwt.sign(
          { id: user.id, email: user.email, roles },
          process.env.JWT_SECRET,
          { expiresIn: "8h" }
        );
        return send.ok(res, {
          token,
          user: {
            id: user.id, email: user.email, fullName: user.full_name, roles,
            ...teamInfo,
            workspaces: access.workspaces,
            homeWorkspace: access.home,
          },
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/auth/forgot-password
    // Always the same response, and the work happens after we've replied — see
    // sendSelfServiceReset for why neither the body nor the timing may depend
    // on whether the address has an account.
    forgotPassword: async (req, res) => {
      const email = String(req.body?.email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
        return send.bad(res, "Please enter a valid email address");
      }
      send.ok(res, {
        success: true,
        message: "If an account exists for that address, a password reset link is on its way.",
        expires_in_minutes: RESET_TTL_MINUTES.self_service,
      });
      sendSelfServiceReset(pool, { email, requestIp: req.ip });
    },

    // POST /api/auth/reset-password/validate — token in the body, never the URL,
    // so it doesn't end up in access logs.
    validateResetToken: async (req, res) => {
      try {
        const result = await inspectToken(pool, req.body?.token);
        return send.ok(res, { ...result, min_password_length: MIN_PASSWORD_LENGTH });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/auth/reset-password
    resetPassword: async (req, res) => {
      try {
        const result = await completeReset(pool, {
          rawToken: req.body?.token,
          password: req.body?.password,
        });
        if (!result.ok) return res.status(result.status).json({ error: result.error });
        forgetSession(result.userId);
        return send.ok(res, { success: true, message: "Your password has been changed. You can now sign in." });
      } catch (e) {
        console.error("resetPassword error:", e);
        return send.serverErr(res);
      }
    },

    // GET /api/auth/me
    me: async (req, res) => {
      try {
        const user = await findUserById(pool, req.user.id);
        if (!user) return send.unauthorized(res, "User not found");
        const roles = await getUserRoles(pool, req.user.id);
        const teamInfo = await fetchTeamModules(pool, req.user.id);
        const access = await computeWorkspaceAccess(pool, req.user.id, roles);
        return send.ok(res, {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            isActive: user.is_active,
            createdAt: user.created_at,
            roles,
            ...teamInfo,
            workspaces: access.workspaces,
            homeWorkspace: access.home,
          },
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
