// src/routes/organizations.js
import { Router } from "express";
import { body } from "express-validator";
import { requireAuth, requireRole } from "../middleware/auth.js";

export function makeOrganizationRouter(controller) {
  const router = Router();

  router.get("/organizations", requireAuth, requireRole("admin", "agent"), controller.list);

  router.post(
    "/organizations",
    requireAuth,
    requireRole("admin", "agent"),
    [body("name").isLength({ min: 2 }).withMessage("Organization name required")],
    controller.create
  );

  router.patch("/organizations/:id", requireAuth, requireRole("admin"), controller.update);
  router.delete("/organizations/:id", requireAuth, requireRole("admin"), controller.remove);

  return router;
}
