// src/utils/roles.js
export async function getUserRoles(pool, userId) {
  const [rows] = await pool.query(
    `SELECT r.name
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ?`,
    [userId]
  );
  return rows.map((row) => row.name);
}

export async function getRoleIdsByName(pool, roleNames) {
  if (!roleNames || roleNames.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT id, name FROM roles WHERE name IN (${roleNames.map(() => "?").join(",")})`,
    roleNames
  );
  const map = new Map(rows.map((row) => [row.name, row.id]));
  return roleNames.map((name) => map.get(name)).filter(Boolean);
}

export async function setUserRoles(pool, userId, roleNames) {
  const roleIds = await getRoleIdsByName(pool, roleNames);
  await pool.query("DELETE FROM user_roles WHERE user_id = ?", [userId]);
  if (roleIds.length === 0) return;
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ${roleIds
      .map(() => "(?, ?)")
      .join(",")}`,
    roleIds.flatMap((roleId) => [userId, roleId])
  );
}
