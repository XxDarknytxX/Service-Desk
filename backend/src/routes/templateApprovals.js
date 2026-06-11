// src/routes/templateApprovals.js
import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export function makeTemplateApprovalRouter(controller) {
  const router = Router();

  // ── Template Approval Flows (admin only) ──
  router.get("/templates/:id/approval-flow", requireAuth, requireAdmin, controller.getFlow);
  router.put("/templates/:id/approval-flow", requireAuth, requireAdmin, controller.saveFlow);
  router.delete("/templates/:id/approval-flow", requireAuth, requireAdmin, controller.deleteFlow);
  router.post("/templates/:id/approval-flow/test", requireAuth, requireAdmin, controller.testFlow);

  return router;
}
