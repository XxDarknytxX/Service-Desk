// src/routes/sla.js
import express from "express";
import { verifyToken, requireAgent, requireAdmin } from "../middleware/auth.js";

export function makeSlaRouter(controller) {
  const router = express.Router();

  // SLA Policies
  router.get("/sla/policies", verifyToken, controller.getPolicies);
  router.get("/sla/policies/:id", verifyToken, controller.getPolicy);
  router.post("/sla/policies", verifyToken, requireAdmin, controller.createPolicy);
  router.put("/sla/policies/:id", verifyToken, requireAdmin, controller.updatePolicy);
  router.delete("/sla/policies/:id", verifyToken, requireAdmin, controller.deletePolicy);

  // Ticket SLAs - List and details
  router.get("/sla/ticket-slas", verifyToken, controller.getTicketSlas);
  router.get("/sla/tickets/:ticketId", verifyToken, controller.getTicketSla);
  router.get("/sla/tickets/:ticketId/history", verifyToken, controller.getTicketSlaHistory);

  // SLA Management actions
  router.post("/sla/tickets/:ticketId/pause", verifyToken, requireAgent, controller.pauseTicketSla);
  router.post("/sla/tickets/:ticketId/resume", verifyToken, requireAgent, controller.resumeTicketSla);
  router.post("/sla/tickets/:ticketId/extend", verifyToken, requireAgent, controller.extendTicketSla);
  router.post("/sla/tickets/:ticketId/reassign", verifyToken, requireAgent, controller.reassignTicketSla);

  // SLA Monitoring
  router.get("/sla/at-risk", verifyToken, controller.getAtRiskTickets);
  router.post("/sla/check-breaches", verifyToken, requireAdmin, controller.checkBreaches);

  // SLA Statistics
  router.get("/sla/stats", verifyToken, controller.getSlaStats);
  router.get("/sla/stats/by-policy", verifyToken, controller.getSlaStatsByPolicy);

  // Business Hours
  router.get("/sla/business-hours", verifyToken, controller.getBusinessHours);
  router.post("/sla/business-hours", verifyToken, requireAdmin, controller.createBusinessHours);
  router.put("/sla/business-hours/:id", verifyToken, requireAdmin, controller.updateBusinessHours);
  router.delete("/sla/business-hours/:id", verifyToken, requireAdmin, controller.deleteBusinessHours);

  // Approval SLAs
  router.get("/sla/approval-slas", verifyToken, controller.getApprovalSlaList);
  router.get("/sla/approval-slas/stats", verifyToken, controller.getApprovalSlaStats);
  router.get("/sla/approval-slas/tickets/:ticketId", verifyToken, controller.getApprovalSlas);
  router.post("/sla/approval-slas/check-breaches", verifyToken, requireAdmin, controller.checkApprovalSlaBreaches);
  router.get("/sla/approval-rules", verifyToken, controller.getApprovalRules);

  return router;
}
