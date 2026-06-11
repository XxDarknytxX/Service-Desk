// src/routes/hierarchy.js
import { Router } from "express";
import { body } from "express-validator";
import { requireAuth, requireRole } from "../middleware/auth.js";

export function makeHierarchyRouter(controller) {
  const router = Router();

  // Get user's reporting chain
  router.get("/hierarchy/user/:id", requireAuth, controller.getUserChain);

  // Get manager's direct reports
  router.get("/hierarchy/manager/:id/reports", requireAuth, controller.getDirectReports);

  // Get full org chart
  router.get("/hierarchy/org-chart", requireAuth, requireRole("admin", "agent"), controller.getOrgChart);

  // Set user's manager (admin only)
  router.post(
    "/hierarchy/set-manager",
    requireAuth,
    requireRole("admin"),
    [
      body("user_id").isInt().withMessage("Valid user_id required"),
      body("manager_id").isInt().withMessage("Valid manager_id required")
    ],
    controller.setManager
  );

  // Remove user from hierarchy
  router.delete("/hierarchy/user/:id", requireAuth, requireRole("admin"), controller.removeUser);

  return router;
}
