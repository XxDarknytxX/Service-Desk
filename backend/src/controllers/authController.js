// src/controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { getUserRoles, setUserRoles } from "../utils/roles.js";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  unauthorized: (res, msg = "Unauthorized") => res.status(401).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

async function findUserByEmail(pool, email) {
  const [rows] = await pool.query(
    `SELECT id, email, password_hash, full_name, is_active
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

async function createUser(pool, { email, passwordHash, fullName }) {
  const [res] = await pool.query(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES (?, ?, ?)`,
    [email, passwordHash, fullName || null]
  );
  return res.insertId;
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
    // POST /api/auth/register
    register: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { email, password, fullName } = req.body;
      try {
        const existing = await findUserByEmail(pool, email);
        if (existing) return send.bad(res, "Email already registered");

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = await createUser(pool, { email, passwordHash, fullName });
        await setUserRoles(pool, userId, ["requester"]);

        return send.created(res, { id: userId, email, fullName });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

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
        if (!ok) return send.bad(res, "Invalid credentials");

        const roles = await getUserRoles(pool, user.id);
        const teamInfo = await fetchTeamModules(pool, user.id);
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
          },
        });
      } catch (e) {
        console.error(e);
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
        return send.ok(res, {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            isActive: user.is_active,
            createdAt: user.created_at,
            roles,
            ...teamInfo,
          },
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
