// src/routes/reports.js
import express from "express";
import { verifyToken, requireRole } from "../middleware/auth.js";

export function makeReportRouter(controller) {
  const router = express.Router();

  // Existing (enhanced)
  router.get("/reports/ticket-metrics", verifyToken, controller.getTicketMetrics);
  router.get("/reports/agent-performance", verifyToken, controller.getAgentPerformance);
  router.get("/reports/sla-compliance", verifyToken, controller.getSlaCompliance);
  router.get("/reports/customer-satisfaction", verifyToken, controller.getCustomerSatisfaction);
  router.get("/reports/ticket-trends", verifyToken, controller.getTicketTrends);

  // New endpoints
  router.get("/reports/team-performance", verifyToken, controller.getTeamPerformance);
  router.get("/reports/department-breakdown", verifyToken, controller.getDepartmentBreakdown);
  router.get("/reports/approval-metrics", verifyToken, controller.getApprovalMetrics);
  router.get("/reports/asset-summary", verifyToken, controller.getAssetSummary);
  router.get("/reports/resolution-distribution", verifyToken, controller.getResolutionDistribution);
  router.get("/reports/requester-activity", verifyToken, controller.getRequesterActivity);
  router.get("/reports/hourly-heatmap", verifyToken, controller.getHourlyHeatmap);

  // Vodafone dashboard-style widgets
  router.get("/reports/agent-workload", verifyToken, controller.getAgentWorkload);
  router.get("/reports/at-risk-tickets", verifyToken, controller.getAtRiskTickets);
  router.get("/reports/sla-priority-breakdown", verifyToken, controller.getSlaPriorityBreakdown);

  // Excel export
  router.get("/reports/export", verifyToken, requireRole("admin", "agent"), controller.exportReport);

  return router;
}
