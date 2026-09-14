/**
 * Workspace split migration — Corporate app vs Internal app.
 *
 * The corporate service flow (customers raise by category → NOC triage →
 * delivery queues → engineers/managers) and the internal service desk
 * (templates, approvals, assets, forms…) are two separate applications that
 * happen to share a codebase and a database. This migration gives the data the
 * boundary the code will enforce:
 *
 *   teams.workspace        'internal' | 'corporate'
 *   teams.corporate_role   'triage' | 'queue' | 'service_delivery' | NULL
 *                          — replaces looking teams up by NAME ("NOC", the
 *                          Cloud/Transmission/MTX/Security Ops whitelist) and
 *                          the SDM by job TITLE, all of which broke silently on
 *                          a rename.
 *   tickets.workspace      'internal' | 'corporate'
 *
 * Who can use which app is DERIVED, not stored: admins → both; corporate
 * customers and members of any corporate team → Corporate; everyone else →
 * Internal (see middleware/workspace.js).
 *
 * Idempotent. Every run only FILLS GAPS — it never overrides a team an admin has
 * configured. One-time moves (backfilling existing tickets, moving the Service
 * Delivery staff) happen only on the run that first adds the column.
 *
 * On a fresh install this is also what makes the corporate flow work at all:
 * the category migrations resolve routing teams by name, and a fresh database
 * has no teams — so every category routed nowhere. Here we create the missing
 * delivery teams (empty — an admin adds the people) and wire the categories.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
const DB = unquote(process.env.DATABASE_NAME);
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT) || 3306,
  user: unquote(process.env.DATABASE_USER),
  password: unquote(process.env.DATABASE_PASSWORD),
  database: DB,
});

// Default delivery team per customer category, used ONLY to fill a category
// that currently routes nowhere.
const DEFAULT_QUEUE_FOR_CATEGORY = {
  connectivity: "Transmission",
  cloud: "Cloud",
  unified_comms: "MTX",
  cyber_security: "Security Operations",
};

const SERVICE_DELIVERY_TITLES = ["Service Delivery Manager", "Service Delivery Executive"];

async function colExists(conn, table, col) {
  const [r] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [DB, table, col]
  );
  return r.length > 0;
}

async function indexExists(conn, table, index) {
  const [r] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?`,
    [DB, table, index]
  );
  return r.length > 0;
}

/** Find a team by name, or create it as a corporate team. Returns its id. */
async function findOrCreateCorporateTeam(conn, name, role, description) {
  const [[existing]] = await conn.query(`SELECT id FROM teams WHERE name = ? LIMIT 1`, [name]);
  if (existing) {
    await conn.query(
      `UPDATE teams SET workspace = 'corporate', corporate_role = COALESCE(corporate_role, ?) WHERE id = ?`,
      [role, existing.id]
    );
    return { id: existing.id, created: false };
  }
  const [res] = await conn.query(
    `INSERT INTO teams (name, description, workspace, corporate_role) VALUES (?, ?, 'corporate', ?)`,
    [name, description, role]
  );
  return { id: res.insertId, created: true };
}

async function migrate() {
  const conn = await pool.getConnection();
  try {
    // ── 1. Columns ────────────────────────────────────────────────────────
    const firstRunTeams = !(await colExists(conn, "teams", "workspace"));
    if (firstRunTeams) {
      await conn.query(
        `ALTER TABLE teams ADD COLUMN workspace ENUM('internal','corporate') NOT NULL DEFAULT 'internal' AFTER description`
      );
      console.log("  + teams.workspace");
    }
    if (!(await colExists(conn, "teams", "corporate_role"))) {
      await conn.query(
        `ALTER TABLE teams ADD COLUMN corporate_role ENUM('triage','queue','service_delivery') NULL AFTER workspace`
      );
      console.log("  + teams.corporate_role");
    }

    const firstRunTickets = !(await colExists(conn, "tickets", "workspace"));
    if (firstRunTickets) {
      await conn.query(
        `ALTER TABLE tickets ADD COLUMN workspace ENUM('internal','corporate') NOT NULL DEFAULT 'internal' AFTER team_id`
      );
      console.log("  + tickets.workspace");
    }
    if (!(await indexExists(conn, "tickets", "idx_tickets_workspace"))) {
      await conn.query(`ALTER TABLE tickets ADD INDEX idx_tickets_workspace (workspace, status_id)`);
      console.log("  + index tickets(workspace, status_id)");
    }

    // ── 2. Any team a customer category routes to IS a corporate team ─────
    // Invariant, safe on every run: it only fills an unset role.
    const [triageTagged] = await conn.query(
      `UPDATE teams t JOIN service_categories sc ON sc.routing_team_id = t.id AND sc.is_triage = 1
          SET t.workspace = 'corporate', t.corporate_role = 'triage'
        WHERE t.corporate_role IS NULL`
    );
    const [queueTagged] = await conn.query(
      `UPDATE teams t JOIN service_categories sc ON sc.routing_team_id = t.id AND sc.is_triage = 0
          SET t.workspace = 'corporate', t.corporate_role = 'queue'
        WHERE t.corporate_role IS NULL`
    );
    if (triageTagged.affectedRows || queueTagged.affectedRows) {
      console.log(`  tagged corporate teams from category routing (triage ${triageTagged.affectedRows}, queues ${queueTagged.affectedRows})`);
    }

    // ── 3. A triage team must exist ───────────────────────────────────────
    const [[triage]] = await conn.query(`SELECT id, name FROM teams WHERE corporate_role = 'triage' LIMIT 1`);
    let triageTeamId = triage?.id;
    if (!triageTeamId) {
      const [[byName]] = await conn.query(
        `SELECT id FROM teams WHERE name IN ('NOC', 'Network Operations') ORDER BY name = 'NOC' DESC LIMIT 1`
      );
      if (byName) {
        await conn.query(`UPDATE teams SET workspace='corporate', corporate_role='triage' WHERE id = ?`, [byName.id]);
        triageTeamId = byName.id;
        console.log(`  tagged existing team #${byName.id} as the triage team`);
      } else {
        const t = await findOrCreateCorporateTeam(conn, "NOC", "triage", "Network Operations Centre — triages corporate requests and routes them to the right delivery team.");
        triageTeamId = t.id;
        console.log(`  + created triage team NOC (#${t.id})`);
      }
    }

    // ── 4. Wire categories that route nowhere ─────────────────────────────
    const [unrouted] = await conn.query(
      `SELECT id, \`key\`, is_triage FROM service_categories WHERE routing_team_id IS NULL`
    );
    for (const cat of unrouted) {
      let teamId = null;
      if (cat.is_triage) {
        teamId = triageTeamId;
      } else if (DEFAULT_QUEUE_FOR_CATEGORY[cat.key]) {
        const t = await findOrCreateCorporateTeam(
          conn,
          DEFAULT_QUEUE_FOR_CATEGORY[cat.key],
          "queue",
          "Corporate delivery queue."
        );
        teamId = t.id;
        if (t.created) console.log(`  + created delivery team ${DEFAULT_QUEUE_FOR_CATEGORY[cat.key]} (#${t.id})`);
      }
      if (teamId) {
        await conn.query(`UPDATE service_categories SET routing_team_id = ? WHERE id = ?`, [teamId, cat.id]);
        console.log(`  category ${cat.key} → team #${teamId}`);
      } else {
        console.warn(`  ! category ${cat.key} still has no routing team — set one in the Corporate app`);
      }
    }

    // ── 5. Service Delivery team (SDM / SDE) ──────────────────────────────
    // Replaces finding the SDM by users.title. Created once; the people are
    // moved in only at creation, after which membership is the admin's call.
    const [[sd]] = await conn.query(`SELECT id FROM teams WHERE corporate_role = 'service_delivery' LIMIT 1`);
    if (!sd) {
      const t = await findOrCreateCorporateTeam(
        conn,
        "Service Delivery",
        "service_delivery",
        "Service Delivery Managers & Executives — notified on every corporate request."
      );
      console.log(`  ${t.created ? "+ created" : "tagged"} Service Delivery team (#${t.id})`);

      const [people] = await conn.query(
        `SELECT u.id, u.full_name, u.title FROM users u
          WHERE u.title IN (?) AND u.is_active = 1
            AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                             WHERE ur.user_id = u.id AND r.name = 'corporate_customer')`,
        [SERVICE_DELIVERY_TITLES]
      );
      for (const p of people) {
        const isLead = p.title === "Service Delivery Manager" ? 1 : 0;
        await conn.query(
          `INSERT INTO team_members (team_id, user_id, is_lead) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE is_lead = VALUES(is_lead)`,
          [t.id, p.id, isLead]
        );
        // They now work in the Corporate app, so they leave internal teams —
        // otherwise they'd sit in two apps' rosters at once.
        const [left] = await conn.query(
          `DELETE tm FROM team_members tm JOIN teams tt ON tt.id = tm.team_id
            WHERE tm.user_id = ? AND tt.workspace = 'internal'`,
          [p.id]
        );
        console.log(`  moved ${p.full_name} into Service Delivery${isLead ? " (lead)" : ""}${left.affectedRows ? `, left ${left.affectedRows} internal team(s)` : ""}`);
      }
    }

    // ── 6. Customers are never team members ───────────────────────────────
    // Seeded customers were put in the internal "Corporate" sales team; team
    // membership is what grants staff access to queues, so it must not exist.
    const [custOut] = await conn.query(
      `DELETE tm FROM team_members tm
        WHERE EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                       WHERE ur.user_id = tm.user_id AND r.name = 'corporate_customer')`
    );
    if (custOut.affectedRows) console.log(`  removed ${custOut.affectedRows} corporate customer team membership(s)`);

    // ── 7. Backfill existing tickets (once) ───────────────────────────────
    if (firstRunTickets) {
      const [moved] = await conn.query(
        `UPDATE tickets t
            SET t.workspace = 'corporate'
          WHERE t.service_category_id IS NOT NULL
             OR t.team_id IN (SELECT id FROM teams WHERE workspace = 'corporate')
             OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                         WHERE ur.user_id = t.requester_id AND r.name = 'corporate_customer')`
      );
      console.log(`  backfilled ${moved.affectedRows} existing ticket(s) into the Corporate workspace`);
    }

    const [summary] = await conn.query(
      `SELECT workspace, COALESCE(corporate_role, '-') AS role, GROUP_CONCAT(name ORDER BY name SEPARATOR ', ') AS teams
         FROM teams GROUP BY workspace, corporate_role ORDER BY workspace, role`
    );
    for (const row of summary) console.log(`  [${row.workspace}/${row.role}] ${row.teams}`);

    console.log("workspace-split migration completed.");
  } catch (e) {
    console.error("Migration failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
