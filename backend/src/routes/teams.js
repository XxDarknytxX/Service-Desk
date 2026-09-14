// src/routes/teams.js
import { Router } from "express";
import { body } from "express-validator";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireStaff } from "../middleware/workspace.js";

export function makeTeamRouter(controller) {
  const router = Router();

  router.get("/teams/modules", requireAuth, requireRole("admin"), controller.getModuleRegistry);
  // Staff only (customers could previously list every team and its members'
  // emails, titles and managers); further scoped to the caller's app.
  router.get("/teams", requireAuth, requireStaff, controller.list);
  router.get("/teams/:id/members", requireAuth, requireStaff, controller.getMembers);
  router.get("/teams/:id/access", requireAuth, requireRole("admin"), controller.getTeamAccess);
  router.put("/teams/:id/access", requireAuth, requireRole("admin"), controller.setTeamAccess);

  router.post(
    "/teams",
    requireAuth,
    requireRole("admin"),
    [body("name").isLength({ min: 2 }).withMessage("Team name required")],
    controller.create
  );

  router.patch("/teams/:id", requireAuth, requireRole("admin"), controller.update);
  router.delete("/teams/:id", requireAuth, requireRole("admin"), controller.remove);

  // Team member management
  router.post("/teams/members", requireAuth, requireRole("admin"), controller.addMember);
  router.delete("/teams/members/:userId", requireAuth, requireRole("admin"), controller.removeMember);

  return router;
}
