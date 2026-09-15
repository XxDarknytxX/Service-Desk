// src/services/hierarchyService.js
//
// Reporting hierarchy: who reports to whom, and the escalation / approval
// LAYERS that follow from it (L1 = direct manager, L2 = their manager, …).
//
// Storage is user_hierarchy, which keeps one row per (user, ancestor, level).
// Only the level-1 rows are authoritative — the deeper rows are a cached copy of
// walking level-1 links, kept because the internal approval workflow queries
// "manager at level N" directly. Anything that changes a level-1 link must
// therefore rebuild the cached rows for that person AND everyone below them;
// the old set-manager only rebuilt the person themselves, leaving their
// reports' L2+ rows pointing at the previous chain.
//
// Each app has a SELF-CONTAINED hierarchy: a corporate person's layers are
// corporate staff, an internal person's are internal staff. Escalation walks
// level-1 links live and stops at the app boundary, so a reporting line that
// still crosses into the other app (e.g. a corporate team manager who reports
// to an internal executive) ends the chain there — it's shown as "reports
// outside" rather than silently escalating a customer's request out of the
// corporate desk.

const MAX_DEPTH = 12;

/** SQL predicate: is user `alias`.id in the given app's staff directory? */
function directorySql(workspace, alias = "u") {
  const inCorpTeam = `EXISTS (SELECT 1 FROM team_members tmx JOIN teams tx ON tx.id = tmx.team_id
                              WHERE tmx.user_id = ${alias}.id AND tx.workspace = 'corporate')`;
  // The Executive layer belongs to BOTH hierarchies (they top the corporate
  // escalation chain and run the internal side), so only corporate-only teams
  // take someone out of the internal chart.
  const inCorpOnlyTeam = `EXISTS (SELECT 1 FROM team_members tmy JOIN teams ty ON ty.id = tmy.team_id
                                  WHERE tmy.user_id = ${alias}.id AND ty.workspace = 'corporate'
                                    AND (ty.corporate_role <=> 'executive') = 0)`;
  const isCustomer = `EXISTS (SELECT 1 FROM user_roles urx JOIN roles rx ON rx.id = urx.role_id
                              WHERE urx.user_id = ${alias}.id AND rx.name = 'corporate_customer')`;
  return workspace === "corporate"
    ? `(${inCorpTeam} AND NOT ${isCustomer})`
    : `(NOT ${inCorpOnlyTeam} AND NOT ${isCustomer})`;
}

export async function isInStaffDirectory(pool, userId, workspace) {
  const [[row]] = await pool.query(
    `SELECT ${directorySql(workspace)} AS ok FROM users u WHERE u.id = ? AND u.is_active = 1`,
    [userId]
  );
  return !!row?.ok;
}

export async function getDirectManagerId(pool, userId) {
  const [[row]] = await pool.query(
    "SELECT manager_id FROM user_hierarchy WHERE user_id = ? AND level = 1 AND is_active = 1 LIMIT 1",
    [userId]
  );
  return row?.manager_id || null;
}

/**
 * The escalation layers above `userId` inside `workspace`.
 * Returns { chain: [{ layer, id, full_name, title }], outside: {id, full_name, title} | null }.
 * `outside` is the first manager beyond the app boundary, for display only.
 */
export async function getEscalationChain(pool, userId, workspace) {
  const chain = [];
  const seen = new Set([Number(userId)]);
  let current = Number(userId);
  let outside = null;

  for (let layer = 1; layer <= MAX_DEPTH; layer++) {
    const managerId = await getDirectManagerId(pool, current);
    if (!managerId || seen.has(managerId)) break;
    seen.add(managerId);

    const [[mgr]] = await pool.query(
      `SELECT u.id, u.full_name, u.title, u.is_active, ${directorySql(workspace)} AS in_app
         FROM users u WHERE u.id = ?`,
      [managerId]
    );
    if (!mgr) break;
    if (!mgr.in_app || !mgr.is_active) {
      outside = { id: mgr.id, full_name: mgr.full_name, title: mgr.title };
      break;
    }
    chain.push({ layer, id: mgr.id, full_name: mgr.full_name, title: mgr.title });
    current = managerId;
  }
  return { chain, outside };
}

/** Would making `managerId` the manager of `userId` create a loop? */
export async function wouldCreateCycle(pool, userId, managerId) {
  let current = Number(managerId);
  const seen = new Set();
  while (current && !seen.has(current) && seen.size < 200) {
    if (current === Number(userId)) return true;
    seen.add(current);
    current = await getDirectManagerId(pool, current);
  }
  return false;
}

/** Rebuild the cached multi-level rows for one user from live level-1 links. */
async function rebuildChainFor(conn, userId, directManagerId) {
  await conn.query("DELETE FROM user_hierarchy WHERE user_id = ?", [userId]);
  let managerId = directManagerId;
  const seen = new Set([Number(userId)]);
  for (let level = 1; managerId && level <= MAX_DEPTH && !seen.has(managerId); level++) {
    seen.add(managerId);
    await conn.query(
      "INSERT INTO user_hierarchy (user_id, manager_id, level, is_active) VALUES (?, ?, ?, 1)",
      [userId, managerId, level]
    );
    const [[up]] = await conn.query(
      "SELECT manager_id FROM user_hierarchy WHERE user_id = ? AND level = 1 AND is_active = 1 LIMIT 1",
      [managerId]
    );
    managerId = up?.manager_id || null;
  }
}

/**
 * Set (or clear, with managerId = null) a user's direct manager, then rebuild
 * the cached chain for that user and everyone who reports to them, top-down.
 * Runs in a transaction so a failure can't leave half a tree rebuilt.
 */
export async function setDirectManager(pool, userId, managerId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Snapshot descendants (breadth-first, so parents rebuild before children)
    // along with their current direct managers, before touching any rows.
    const order = [];
    let frontier = [Number(userId)];
    const visited = new Set(frontier);
    while (frontier.length) {
      const [rows] = await conn.query(
        `SELECT user_id, manager_id FROM user_hierarchy
          WHERE level = 1 AND is_active = 1 AND manager_id IN (?)`,
        [frontier]
      );
      const next = [];
      for (const r of rows) {
        if (visited.has(r.user_id)) continue;
        visited.add(r.user_id);
        order.push({ userId: r.user_id, managerId: r.manager_id });
        next.push(r.user_id);
      }
      frontier = next;
    }

    await rebuildChainFor(conn, userId, managerId || null);
    for (const d of order) await rebuildChainFor(conn, d.userId, d.managerId);

    await conn.commit();
    return { rebuilt: order.length + 1 };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
