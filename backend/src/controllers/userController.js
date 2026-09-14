// src/controllers/userController.js
import bcrypt from "bcryptjs";
import { validationResult } from "express-validator";
import { getUserRoles, setUserRoles } from "../utils/roles.js";
import { forgetSession } from "../middleware/auth.js";
import { resolveRequestWorkspace, computeWorkspaceAccess, getWorkspaceAccess, canAccessWorkspace } from "../middleware/workspace.js";

// A corporate customer is a different KIND of account, not a permission level:
// combining it with a staff role would hand an external customer the staff side
// of the app (isAgent is true for any agent/admin role).
function validateRoleSet(roles) {
  if (!Array.isArray(roles)) return null;
  if (roles.includes("corporate_customer") && roles.length > 1) {
    return "A corporate customer can't also have another role.";
  }
  return null;
}

// SQL predicates for "belongs to this app's directory". Admins are in both.
const IS_ADMIN_SQL = `EXISTS (SELECT 1 FROM user_roles ura JOIN roles ra ON ra.id = ura.role_id WHERE ura.user_id = u.id AND ra.name = 'admin')`;
const IS_CUSTOMER_SQL = `EXISTS (SELECT 1 FROM user_roles urc JOIN roles rc ON rc.id = urc.role_id WHERE urc.user_id = u.id AND rc.name = 'corporate_customer')`;
const IN_CORP_TEAM_SQL = `EXISTS (SELECT 1 FROM team_members tmc JOIN teams tc ON tc.id = tmc.team_id WHERE tmc.user_id = u.id AND tc.workspace = 'corporate')`;
const WORKSPACE_DIRECTORY_SQL = {
  internal: `(${IS_ADMIN_SQL} OR (NOT ${IS_CUSTOMER_SQL} AND NOT ${IN_CORP_TEAM_SQL}))`,
  corporate: `(${IS_ADMIN_SQL} OR ${IS_CUSTOMER_SQL} OR ${IN_CORP_TEAM_SQL})`,
};
import { sendAdminReset } from "../services/passwordResetService.js";
import * as XLSX from "xlsx";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeUserController(pool) {
  return {
    // GET /api/users
    // GET /api/users[?workspace=internal|corporate]
    // The directory of ONE app: internal staff, or corporate customers + the
    // staff who serve them. Non-admins only ever get their own app's directory.
    list: async (req, res) => {
      try {
        let workspace;
        try {
          ({ workspace } = await resolveRequestWorkspace(req));
        } catch (err) {
          return res.status(err.status || 403).json({ error: err.message });
        }
        const [rows] = await pool.query(
          `SELECT u.id, u.email, u.full_name, u.title, u.company, u.phone, u.is_active,
                  u.created_at, u.last_login_at,
                  ${IN_CORP_TEAM_SQL} AS in_corporate_team,
                  GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ',') AS roles
           FROM users u
           LEFT JOIN user_roles ur ON ur.user_id = u.id
           LEFT JOIN roles r ON r.id = ur.role_id
           WHERE ${WORKSPACE_DIRECTORY_SQL[workspace]}
           GROUP BY u.id
           ORDER BY u.created_at DESC`
        );
        const items = rows.map((row) => ({
          ...row,
          in_corporate_team: !!row.in_corporate_team,
          roles: row.roles ? row.roles.split(",") : [],
        }));
        return send.ok(res, { items });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/users
    create: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { email, password, fullName, full_name, title, company, phone, roles } = req.body;
      const roleProblem = validateRoleSet(roles);
      if (roleProblem) return send.bad(res, roleProblem);
      try {
        // Generate random password if not provided
        const finalPassword = password || Math.random().toString(36).slice(-10) + 'Aa1!';
        const passwordHash = await bcrypt.hash(finalPassword, 10);

        // Support both fullName and full_name for compatibility
        const name = full_name || fullName || null;

        const [result] = await pool.query(
          `INSERT INTO users (email, password_hash, full_name, title, company, phone)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [email, passwordHash, name, title || null, company || null, phone || null]
        );
        const userId = result.insertId;
        await setUserRoles(pool, userId, roles && roles.length ? roles : ["requester"]);
        const userRoles = await getUserRoles(pool, userId);

        // Return the generated password if one was auto-generated
        const responseData = {
          id: userId,
          email,
          full_name: name,
          roles: userRoles
        };
        if (!password) {
          responseData.generatedPassword = finalPassword;
        }

        return send.created(res, responseData);
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PATCH /api/users/:id
    update: async (req, res) => {
      const userId = Number(req.params.id);
      try {
        const fields = ["full_name", "title", "company", "phone", "is_active"];
        const updates = [];
        const values = [];

        for (const field of fields) {
          if (field in req.body) {
            updates.push(`${field} = ?`);
            values.push(req.body[field]);
          }
        }

        // Handle email update with duplicate check
        if ("email" in req.body && req.body.email) {
          const [existing] = await pool.query(
            `SELECT id FROM users WHERE email = ? AND id != ?`,
            [req.body.email, userId]
          );
          if (existing.length > 0) {
            return send.bad(res, "Email is already in use by another user");
          }
          updates.push(`email = ?`);
          values.push(req.body.email);
        }

        // Handle password update. Stamping password_changed_at signs out the
        // user's existing sessions, same as an emailed reset — an admin setting
        // a password by hand is usually doing it for the same reasons.
        const passwordChanged = !!(req.body.password && req.body.password.trim());
        if (passwordChanged) {
          const passwordHash = await bcrypt.hash(req.body.password, 10);
          updates.push(`password_hash = ?`, `password_changed_at = NOW()`);
          values.push(passwordHash);
        }

        if (updates.length > 0) {
          await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, [
            ...values,
            userId,
          ]);
        }

        // Deactivation and password changes must bite on the next request, not
        // after the auth middleware's cache TTL.
        if (passwordChanged || "is_active" in req.body) forgetSession(userId);

        if (req.body.roles) {
          const roleProblem = validateRoleSet(req.body.roles);
          if (roleProblem) return send.bad(res, roleProblem);
          await setUserRoles(pool, userId, req.body.roles);
          // Becoming a customer means leaving every team and the org chart:
          // both are staff structures and team membership grants queue access.
          if (req.body.roles.includes("corporate_customer")) {
            await pool.query("DELETE FROM team_members WHERE user_id = ?", [userId]);
            await pool.query("DELETE FROM user_hierarchy WHERE user_id = ? OR manager_id = ?", [userId, userId]);
          }
          forgetSession(userId);
        }

        const roles = await getUserRoles(pool, userId);
        return send.ok(res, { id: userId, roles });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/users/:id
    getById: async (req, res) => {
      const userId = Number(req.params.id);
      try {
        const [rows] = await pool.query(
          `SELECT id, email, full_name, title, company, phone, is_active, created_at, last_login_at
           FROM users WHERE id = ?`,
          [userId]
        );
        const user = rows[0];
        if (!user) return send.notFound(res, "User not found");
        const roles = await getUserRoles(pool, userId);
        // Staff can only look up people in their own app's directory.
        const viewer = await getWorkspaceAccess(req);
        if (!viewer.isAdmin) {
          const target = await computeWorkspaceAccess(pool, userId, roles);
          if (!target.workspaces.some((w) => canAccessWorkspace(viewer, w))) {
            return send.notFound(res, "User not found");
          }
        }
        return send.ok(res, { user: { ...user, roles } });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/users/:id/reset-password — email the user a single-use reset link.
    // The admin never sees or chooses the new password.
    sendPasswordReset: async (req, res) => {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId <= 0) return send.bad(res, "Invalid user id");
      try {
        const result = await sendAdminReset(pool, {
          userId,
          adminId: req.user.id,
          requestIp: req.ip,
        });
        if (!result.ok) return res.status(result.status).json({ error: result.error });
        return send.ok(res, {
          success: true,
          email: result.email,
          expires_in_minutes: result.ttlMinutes,
          message: `Password reset link sent to ${result.email}`,
        });
      } catch (e) {
        console.error("sendPasswordReset error:", e);
        return send.serverErr(res, "Failed to send password reset");
      }
    },

    // DELETE /api/users/:id
    delete: async (req, res) => {
      const userId = Number(req.params.id);
      try {
        // Prevent deleting yourself
        if (req.user && req.user.id === userId) {
          return send.bad(res, "Cannot delete your own account");
        }

        // Check if user exists
        const [rows] = await pool.query(`SELECT id FROM users WHERE id = ?`, [userId]);
        if (rows.length === 0) {
          return send.notFound(res, "User not found");
        }

        // Delete user roles first (foreign key constraint)
        await pool.query(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);

        // Delete the user
        await pool.query(`DELETE FROM users WHERE id = ?`, [userId]);
        forgetSession(userId);

        return send.ok(res, { success: true, message: "User deleted successfully" });
      } catch (e) {
        console.error(e);
        // Check if it's a foreign key constraint error
        if (e.code === 'ER_ROW_IS_REFERENCED_2') {
          return send.bad(res, "Cannot delete user: They have associated tickets or data");
        }
        return send.serverErr(res);
      }
    },

    // GET /api/users/import-template — download Excel template
    importTemplate: async (_req, res) => {
      try {
        // Fetch role names dynamically from DB
        const [dbRoles] = await pool.query("SELECT name FROM roles ORDER BY FIELD(name, 'admin', 'agent', 'requester')");
        const roleNames = dbRoles.map((r) => r.name);

        const wb = XLSX.utils.book_new();
        // Header: Full Name | Email | Title | Admin | Agent | Requester
        const header = ["Full Name", "Email", "Title", ...roleNames.map((r) => r.charAt(0).toUpperCase() + r.slice(1))];
        const sampleData = [
          header,
          ["Jane Doe", "jane@company.com", "Support Engineer", 0, 1, 0],
          ["John Smith", "john@company.com", "IT Manager", 1, 1, 0],
          ["Alice Brown", "alice@company.com", "Employee", 0, 0, 1],
        ];
        const ws = XLSX.utils.aoa_to_sheet(sampleData);

        // Column widths
        ws["!cols"] = [
          { wch: 25 }, // Full Name
          { wch: 30 }, // Email
          { wch: 25 }, // Title
          ...roleNames.map(() => ({ wch: 12 })), // Role columns
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Users");

        // Instructions sheet
        const instructions = [
          ["User Import Template — Instructions"],
          [],
          ["Column", "Required", "Description"],
          ["Full Name", "Yes", "The user's display name (min 2 characters)"],
          ["Email", "Yes", "Must be a valid, unique email address"],
          ["Title", "No", "Job title (e.g. Support Engineer, IT Manager)"],
          ...roleNames.map((r) => [r.charAt(0).toUpperCase() + r.slice(1), "No", `Set to 1 to assign the ${r} role, 0 to skip. Defaults to 0.`]),
          [],
          ["Notes:"],
          ["- If no role columns are set to 1, the user defaults to the 'requester' role."],
          ["- Each user will be created with an auto-generated password."],
          ["- The import results will show the generated passwords — save them!"],
          ["- Duplicate emails (already in the system) will be skipped."],
          ["- Delete the sample rows before importing your data."],
        ];
        const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
        wsInstructions["!cols"] = [{ wch: 15 }, { wch: 12 }, { wch: 70 }];
        XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="user_import_template.xlsx"');
        return res.send(Buffer.from(buf));
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/users/import — bulk import from Excel
    importUsers: async (req, res) => {
      try {
        if (!req.file) return send.bad(res, "No file uploaded");

        const wb = XLSX.read(req.file.buffer, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (rows.length === 0) return send.bad(res, "The spreadsheet is empty");

        // Fetch valid role names from DB
        const [dbRoles] = await pool.query("SELECT name FROM roles");
        const validRoles = dbRoles.map((r) => r.name);

        // Fetch existing emails for duplicate check
        const [existingUsers] = await pool.query("SELECT email FROM users");
        const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

        const results = [];
        let created = 0;
        let skipped = 0;
        let failed = 0;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 2; // 1-indexed + header row

          // Map columns (flexible header matching)
          const fullName = (row["Full Name"] || row["full_name"] || row["Name"] || "").toString().trim();
          const email = (row["Email"] || row["email"] || "").toString().trim().toLowerCase();
          const title = (row["Title"] || row["title"] || "").toString().trim();

          // Parse roles from boolean columns (1/0)
          const assignedRoles = [];
          for (const role of validRoles) {
            const colName = role.charAt(0).toUpperCase() + role.slice(1); // "Admin", "Agent", "Requester"
            const val = row[colName] ?? row[role] ?? row[role.toLowerCase()] ?? "";
            if (Number(val) === 1) {
              assignedRoles.push(role);
            }
          }
          const finalRoles = assignedRoles.length > 0 ? assignedRoles : ["requester"];

          const importRoleProblem = validateRoleSet(finalRoles);
          if (importRoleProblem) {
            results.push({ row: rowNum, email: email || "(empty)", status: "failed", reason: importRoleProblem });
            failed++;
            continue;
          }

          // Validate email
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            results.push({ row: rowNum, email: email || "(empty)", status: "failed", reason: "Invalid or missing email" });
            failed++;
            continue;
          }

          // Validate name
          if (!fullName || fullName.length < 2) {
            results.push({ row: rowNum, email, status: "failed", reason: "Full name is required (min 2 chars)" });
            failed++;
            continue;
          }

          // Check duplicate
          if (existingEmails.has(email)) {
            results.push({ row: rowNum, email, status: "skipped", reason: "Email already exists" });
            skipped++;
            continue;
          }

          // Create user
          const password = Math.random().toString(36).slice(-10) + "Aa1!";
          const passwordHash = await bcrypt.hash(password, 10);

          try {
            const [insertResult] = await pool.query(
              "INSERT INTO users (email, password_hash, full_name, title) VALUES (?, ?, ?, ?)",
              [email, passwordHash, fullName, title || null]
            );
            await setUserRoles(pool, insertResult.insertId, finalRoles);
            existingEmails.add(email); // prevent duplicates within same file

            results.push({
              row: rowNum,
              email,
              full_name: fullName,
              roles: finalRoles,
              status: "created",
              generatedPassword: password,
            });
            created++;
          } catch (dbErr) {
            console.error(`Row ${rowNum} insert error:`, dbErr);
            results.push({ row: rowNum, email, status: "failed", reason: "Database error" });
            failed++;
          }
        }

        return send.ok(res, {
          summary: { total: rows.length, created, skipped, failed },
          results,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
