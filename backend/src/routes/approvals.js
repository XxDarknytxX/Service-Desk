// src/routes/approvals.js
import { Router } from "express";
import { body } from "express-validator";
import { requireAuth, requireRole } from "../middleware/auth.js";

export function makeApprovalRouter(controller) {
  const router = Router();

  // Approval Rules Management (admin only)
  router.get("/approval-rules", requireAuth, requireRole("admin"), controller.listRules);
  router.get("/approval-rules/:id", requireAuth, requireRole("admin"), controller.getRule);

  router.post(
    "/approval-rules",
    requireAuth,
    requireRole("admin"),
    [body("name").isLength({ min: 3 }).withMessage("Rule name required")],
    controller.createRule
  );

  router.patch("/approval-rules/:id", requireAuth, requireRole("admin"), controller.updateRule);
  router.delete("/approval-rules/:id", requireAuth, requireRole("admin"), controller.deleteRule);

  // Approval Delegations (must come before /:id parameterized routes)
  router.get("/approvals/delegations", requireAuth, controller.getDelegations);
  router.post("/approvals/delegate", requireAuth, controller.createDelegation);
  router.delete("/approvals/delegations/:id", requireAuth, controller.revokeDelegation);

  // Ticket Approvals
  router.get("/tickets/:id/approvals", requireAuth, controller.getTicketApprovals);
  router.get("/approvals/pending", requireAuth, controller.getPendingApprovals);
  router.get("/approvals/history/:ticketId", requireAuth, controller.getApprovalHistory);

  router.post(
    "/approvals/:id/delegate",
    requireAuth,
    [body("delegate_id").isInt().withMessage("Delegate user ID is required")],
    controller.delegateApproval
  );

  router.post(
    "/approvals/:id/approve",
    requireAuth,
    [body("comments").optional().isString()],
    controller.approveTicket
  );

  router.post(
    "/approvals/:id/reject",
    requireAuth,
    [
      body("reason").isLength({ min: 5 }).withMessage("Rejection reason required (min 5 chars)"),
      body("comments").optional().isString(),
    ],
    controller.rejectTicket
  );

  // Send ticket for approval (agent action)
  router.post(
    "/tickets/:id/send-for-approval",
    requireAuth,
    requireRole("admin", "agent"),
    controller.sendForApproval
  );

  // Get list of potential approvers
  router.get("/approvers", requireAuth, requireRole("admin", "agent"), controller.getApprovers);

  return router;
}
