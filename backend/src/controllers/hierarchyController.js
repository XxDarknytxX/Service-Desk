// src/controllers/hierarchyController.js
const send = {
  ok: (res, data = {}) => res.json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeHierarchyController(pool) {
  return {
    // GET /api/hierarchy/user/:id - Get user's reporting chain
    getUserChain: async (req, res) => {
      const userId = Number(req.params.id);

      try {
        const [chain] = await pool.query(`
          SELECT uh.level, uh.manager_id, uh.is_active,
                 u.full_name, u.email, u.title,
                 d.name as department_name
          FROM user_hierarchy uh
          INNER JOIN users u ON u.id = uh.manager_id
          LEFT JOIN departments d ON u.department_id = d.id
          WHERE uh.user_id = ? AND uh.is_active = 1
          ORDER BY uh.level ASC
        `, [userId]);

        return send.ok(res, { chain });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/hierarchy/manager/:id/reports - Get all direct reports
    getDirectReports: async (req, res) => {
      const managerId = Number(req.params.id);

      try {
        const [reports] = await pool.query(`
          SELECT DISTINCT u.id, u.full_name, u.email, u.title,
                 d.name as department_name,
                 t.name as team_name
          FROM user_hierarchy uh
          INNER JOIN users u ON u.id = uh.user_id
          LEFT JOIN departments d ON u.department_id = d.id
          LEFT JOIN team_members tm ON tm.user_id = u.id
          LEFT JOIN teams t ON t.id = tm.team_id
          WHERE uh.manager_id = ? AND uh.level = 1 AND uh.is_active = 1
          ORDER BY u.full_name ASC
        `, [managerId]);

        return send.ok(res, { reports });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/hierarchy/set-manager - Set user's manager
    setManager: async (req, res) => {
      console.log("=== SET MANAGER REQUEST ===");
      console.log("Body:", req.body);
      const { user_id, manager_id } = req.body;
      console.log("Parsed - user_id:", user_id, "manager_id:", manager_id);

      if (!user_id || !manager_id) {
        console.log("ERROR: Missing required fields");
        return send.bad(res, "user_id and manager_id are required");
      }

      if (user_id === manager_id) {
        return send.bad(res, "User cannot be their own manager");
      }

      try {
        // Check for circular reference - walk up the proposed manager's chain
        // to see if user_id appears anywhere (would create a loop)
        const circularCheck = await checkCircularReference(pool, user_id, manager_id);
        if (circularCheck.isCircular) {
          return send.bad(res, `Circular reference detected: ${circularCheck.message}`);
        }

        // Delete existing hierarchy for this user
        await pool.query('DELETE FROM user_hierarchy WHERE user_id = ?', [user_id]);

        // Build new hierarchy chain
        await buildHierarchyChain(pool, user_id, manager_id);

        return send.ok(res, { success: true, message: "Manager set successfully" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/hierarchy/user/:id - Remove user from hierarchy
    removeUser: async (req, res) => {
      const userId = Number(req.params.id);

      try {
        await pool.query('DELETE FROM user_hierarchy WHERE user_id = ?', [userId]);
        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/hierarchy/org-chart - Get full organization chart
    getOrgChart: async (req, res) => {
      try {
        // Get all active users with their team info
        const [users] = await pool.query(`
          SELECT u.id, u.full_name, u.email, u.title,
                 d.name as department_name,
                 d.id as department_id,
                 t.id as team_id,
                 t.name as team_name
          FROM users u
          LEFT JOIN departments d ON u.department_id = d.id
          LEFT JOIN team_members tm ON tm.user_id = u.id
          LEFT JOIN teams t ON t.id = tm.team_id
          WHERE u.is_active = 1
          ORDER BY d.name, u.full_name
        `);

        // Get all hierarchy relationships
        const [hierarchy] = await pool.query(`
          SELECT user_id, manager_id, level, is_active
          FROM user_hierarchy
          WHERE is_active = 1
          ORDER BY user_id, level
        `);

        // Get user roles
        const [userRoles] = await pool.query(`
          SELECT ur.user_id, r.name as role
          FROM user_roles ur
          INNER JOIN roles r ON r.id = ur.role_id
        `);

        // Build roles map
        const rolesMap = {};
        userRoles.forEach(ur => {
          if (!rolesMap[ur.user_id]) rolesMap[ur.user_id] = [];
          rolesMap[ur.user_id].push(ur.role);
        });

        // Count direct reports for each user
        const reportCounts = {};
        hierarchy.forEach(h => {
          if (h.level === 1) {
            reportCounts[h.manager_id] = (reportCounts[h.manager_id] || 0) + 1;
          }
        });

        // Add report counts and roles to users
        users.forEach(u => {
          u.report_count = reportCounts[u.id] || 0;
          u.roles = rolesMap[u.id] || [];
        });

        return send.ok(res, { users, hierarchy });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}

// Helper function to check for circular references
// Walks up the proposed manager's reporting chain to see if the user appears anywhere
async function checkCircularReference(pool, userId, proposedManagerId) {
  const visited = new Set();
  let currentId = proposedManagerId;

  // Get user names for better error messages
  const [users] = await pool.query(
    'SELECT id, full_name, email FROM users WHERE id IN (?, ?)',
    [userId, proposedManagerId]
  );
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u.full_name || u.email; });

  while (currentId) {
    // If we've seen this ID before, there's already a loop in the data
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    // If the proposed manager (or anyone in their chain) reports to the user,
    // assigning this manager would create a circular reference
    // Check: does currentId have userId as a manager anywhere in their chain?
    const [hierarchy] = await pool.query(
      'SELECT manager_id FROM user_hierarchy WHERE user_id = ? AND level = 1 AND is_active = 1 LIMIT 1',
      [currentId]
    );

    if (hierarchy.length === 0) {
      // currentId has no manager, no loop possible from this path
      break;
    }

    const nextManagerId = hierarchy[0].manager_id;

    // If the next manager in the chain is the user we're trying to assign a manager to,
    // that would create a loop: user -> proposedManager -> ... -> user
    if (nextManagerId === userId) {
      // Get the chain for the error message
      const chainNames = [];
      for (const id of visited) {
        const [u] = await pool.query('SELECT full_name, email FROM users WHERE id = ?', [id]);
        if (u.length > 0) chainNames.push(u[0].full_name || u[0].email);
      }
      chainNames.push(userMap[userId]);

      return {
        isCircular: true,
        message: `${userMap[userId]} cannot have ${userMap[proposedManagerId]} as manager because ${userMap[proposedManagerId]} already reports to ${userMap[userId]} (chain: ${chainNames.join(' → ')})`
      };
    }

    currentId = nextManagerId;

    // Safety limit to prevent infinite loops
    if (visited.size > 100) {
      break;
    }
  }

  return { isCircular: false };
}

// Helper function to build hierarchy chain recursively
async function buildHierarchyChain(pool, userId, managerId, level = 1, visited = new Set()) {
  // Prevent infinite loops
  if (visited.has(managerId) || level > 10) {
    return;
  }

  visited.add(managerId);

  // Insert direct manager relationship
  await pool.query(
    `INSERT INTO user_hierarchy (user_id, manager_id, level, is_active)
     VALUES (?, ?, ?, 1)`,
    [userId, managerId, level]
  );

  // Get manager's manager and continue building chain
  const [managerChain] = await pool.query(
    `SELECT manager_id FROM user_hierarchy
     WHERE user_id = ? AND level = 1 AND is_active = 1
     LIMIT 1`,
    [managerId]
  );

  if (managerChain.length > 0 && managerChain[0].manager_id) {
    await buildHierarchyChain(pool, userId, managerChain[0].manager_id, level + 1, visited);
  }
}
