// src/middleware/auth.js
import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, email, roles }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
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
