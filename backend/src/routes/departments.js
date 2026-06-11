// src/routes/departments.js
import { Router } from "express";
import { body } from "express-validator";
import { requireAuth, requireRole } from "../middleware/auth.js";

export function makeDepartmentRouter(controller) {
  const router = Router();

  router.get("/departments", requireAuth, controller.list);
  router.get("/departments/:id", requireAuth, controller.getById);
  router.get("/departments/:id/hierarchy", requireAuth, controller.getHierarchy);

  router.post(
    "/departments",
    requireAuth,
    requireRole("admin"),
    [body("name").isLength({ min: 2 }).withMessage("Department name required")],
    controller.create
  );

  router.patch("/departments/:id", requireAuth, requireRole("admin"), controller.update);
  router.delete("/departments/:id", requireAuth, requireRole("admin"), controller.delete);

  return router;
}
