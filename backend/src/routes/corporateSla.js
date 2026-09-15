// src/routes/corporateSla.js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireStaff, requireWorkspace } from "../middleware/workspace.js";

export function makeCorporateSlaRouter(controller) {
  const router = Router();

  // Corporate staff may read the targets; only admins change them (checked in
  // the controller). Path-scoped: every router is mounted at /api.
  router.use("/corporate/sla-settings", requireAuth, requireStaff, requireWorkspace("corporate"));

  router.get("/corporate/sla-settings", controller.get);
  router.put("/corporate/sla-settings", controller.save);

  return router;
}
