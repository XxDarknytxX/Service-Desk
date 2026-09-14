// src/utils/workspaceScopedPool.js
//
// Wraps a mysql2 pool so every read of the `tickets` table sees only one
// workspace's tickets. Used by the reports controller, whose ~20 hand-written
// analytics queries would otherwise each need a workspace clause threaded in
// among their positional `?` parameters — easy to get subtly wrong one query at
// a time.
//
// Every `FROM tickets [alias]` / `JOIN tickets [alias]` becomes
// `FROM (SELECT * FROM tickets WHERE workspace = '<ws>') [alias]`.
// MySQL 8 merges such derived tables back into the outer query (derived_merge),
// so indexes are still used. The workspace is inlined as a literal — it is
// always one of the two known enum values, never request input — which keeps
// the caller's parameter positions untouched.
import { WORKSPACES } from "../middleware/workspace.js";

// Words that can follow a table name but are NOT an alias.
const NOT_AN_ALIAS = new Set([
  "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "STRAIGHT_JOIN",
  "ON", "USING", "GROUP", "ORDER", "LIMIT", "HAVING", "UNION", "WINDOW", "FOR",
  "NATURAL", "LOCK",
]);

export function scopeTicketsSql(sql, workspace) {
  if (!WORKSPACES.includes(workspace)) throw new Error(`Invalid workspace: ${workspace}`);
  const derived = `(SELECT * FROM tickets WHERE workspace = '${workspace}')`;
  return sql.replace(
    /\b(FROM|JOIN)\s+tickets\b(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi,
    (match, keyword, alias) => {
      if (alias && !NOT_AN_ALIAS.has(alias.toUpperCase())) {
        return `${keyword} ${derived} ${alias}`;
      }
      // No alias: keep the table's own name as the alias so `tickets.col` works,
      // and re-emit whatever keyword we consumed.
      const trailing = alias ? ` ${alias}` : "";
      return `${keyword} ${derived} AS tickets${trailing}`;
    }
  );
}

export function makeWorkspaceScopedPool(pool, workspace) {
  return {
    query: (sql, params) =>
      pool.query(typeof sql === "string" ? scopeTicketsSql(sql, workspace) : sql, params),
    execute: (sql, params) =>
      pool.execute(typeof sql === "string" ? scopeTicketsSql(sql, workspace) : sql, params),
  };
}
