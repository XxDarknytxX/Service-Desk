import "dotenv/config";
import bcrypt from "bcryptjs";
import { getPool } from "./config/db.js";

async function seed() {
  const pool = await getPool();

  // Seed lookup tables
  await pool.query(
    `INSERT INTO roles (name, description) VALUES
      ('admin', 'System administrator'),
      ('agent', 'Support agent'),
      ('requester', 'Customer requester')
     ON DUPLICATE KEY UPDATE description = VALUES(description)`
  );

  await pool.query(
    `INSERT INTO ticket_statuses (\`key\`, label, is_closed, sort_order) VALUES
      ('new', 'New', 0, 1),
      ('open', 'Open', 0, 2),
      ('pending', 'Pending', 0, 3),
      ('on_hold', 'On hold', 0, 4),
      ('solved', 'Solved', 1, 5),
      ('closed', 'Closed', 1, 6)
     ON DUPLICATE KEY UPDATE label = VALUES(label), is_closed = VALUES(is_closed), sort_order = VALUES(sort_order)`
  );

  await pool.query(
    `INSERT INTO ticket_priorities (\`key\`, label, sort_order, response_sla_minutes, resolve_sla_minutes) VALUES
      ('low', 'Low', 1, 240, 1440),
      ('normal', 'Normal', 2, 120, 960),
      ('high', 'High', 3, 60, 480),
      ('urgent', 'Urgent', 4, 30, 240)
     ON DUPLICATE KEY UPDATE label = VALUES(label), sort_order = VALUES(sort_order),
       response_sla_minutes = VALUES(response_sla_minutes), resolve_sla_minutes = VALUES(resolve_sla_minutes)`
  );

  await pool.query(
    `INSERT INTO ticket_types (\`key\`, label) VALUES
      ('incident', 'Incident'),
      ('service_request', 'Service request'),
      ('problem', 'Problem'),
      ('change', 'Change')
     ON DUPLICATE KEY UPDATE label = VALUES(label)`
  );

  await pool.query(
    `INSERT INTO ticket_channels (\`key\`, label) VALUES
      ('portal', 'Portal'),
      ('email', 'Email'),
      ('phone', 'Phone'),
      ('chat', 'Chat'),
      ('api', 'API')
     ON DUPLICATE KEY UPDATE label = VALUES(label)`
  );

  // Check user table structure
  let userColumns = [];
  try {
    const [columns] = await pool.query("SHOW COLUMNS FROM users");
    userColumns = columns.map((column) => column.Field);
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") {
      console.error("Users table not found. Run the schema migration before seeding.");
    }
    throw err;
  }

  const hasFullName = userColumns.includes("full_name");

  // Get role IDs
  const [roles] = await pool.query("SELECT id, name FROM roles");
  const roleMap = {};
  roles.forEach(role => {
    roleMap[role.name] = role.id;
  });

  // Define test users
  const testUsers = [
    {
      email: process.env.SEED_ADMIN_EMAIL || "admin@servicedesk.local",
      password: process.env.SEED_ADMIN_PASSWORD || "admin123",
      fullName: process.env.SEED_ADMIN_NAME || "Admin User",
      title: "System Administrator",
      roles: ["admin", "agent"]
    },
    {
      email: "agent@servicedesk.local",
      password: "agent123",
      fullName: "Agent User",
      title: "Support Agent",
      roles: ["agent"]
    },
    {
      email: "user@servicedesk.local",
      password: "user123",
      fullName: "Customer User",
      title: "End User",
      roles: ["requester"]
    }
  ];

  console.log("\n🌱 Seeding users...\n");

  // Create users
  for (const user of testUsers) {
    const passwordHash = await bcrypt.hash(user.password, 10);

    // Check if user exists
    const [existingUsers] = await pool.query("SELECT id FROM users WHERE email = ?", [user.email]);
    let userId;

    if (existingUsers.length) {
      userId = existingUsers[0].id;
      // Update existing user
      if (hasFullName) {
        await pool.query(
          "UPDATE users SET password_hash = ?, full_name = ?, title = ? WHERE id = ?",
          [passwordHash, user.fullName, user.title, userId]
        );
      } else {
        await pool.query(
          "UPDATE users SET password_hash = ? WHERE id = ?",
          [passwordHash, userId]
        );
      }
    } else {
      // Create new user
      if (hasFullName) {
        const [result] = await pool.query(
          "INSERT INTO users (email, password_hash, full_name, title) VALUES (?, ?, ?, ?)",
          [user.email, passwordHash, user.fullName, user.title]
        );
        userId = result.insertId;
      } else {
        const [result] = await pool.query(
          "INSERT INTO users (email, password_hash) VALUES (?, ?)",
          [user.email, passwordHash]
        );
        userId = result.insertId;
      }
    }

    // Assign roles
    for (const roleName of user.roles) {
      const roleId = roleMap[roleName];
      if (roleId) {
        await pool.query(
          "INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
          [userId, roleId]
        );
      }
    }

    console.log(`✅ ${user.fullName.padEnd(20)} | ${user.email.padEnd(30)} | Password: ${user.password} | Roles: ${user.roles.join(", ")}`);
  }

  await pool.end();

  console.log("\n" + "=".repeat(80));
  console.log("✅ Database seeded successfully!");
  console.log("=".repeat(80));
  console.log("\n📝 TEST CREDENTIALS:\n");
  console.log("┌─────────────────────┬──────────────────────────────┬─────────────┬──────────────────┐");
  console.log("│ Role                │ Email                        │ Password    │ Permissions      │");
  console.log("├─────────────────────┼──────────────────────────────┼─────────────┼──────────────────┤");
  console.log("│ Admin               │ admin@servicedesk.local      │ admin123    │ Full Access      │");
  console.log("│ Agent               │ agent@servicedesk.local      │ agent123    │ Tickets, Reports │");
  console.log("│ Requester           │ user@servicedesk.local       │ user123     │ Own Tickets      │");
  console.log("└─────────────────────┴──────────────────────────────┴─────────────┴──────────────────┘");
  console.log("\n🚀 Start the server and login at http://localhost:3000\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
