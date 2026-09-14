// src/routes/reports.js
import express from "express";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { requireStaff, resolveRequestWorkspace } from "../middleware/workspace.js";
import { makeWorkspaceScopedPool } from "../utils/workspaceScopedPool.js";

/**
 * Reports are per app: the corporate desk and the internal desk each report on
 * their own tickets only. `makeController(pool)` is the report controller
 * factory; it's instantiated once per workspace over a pool that only ever sees
 * that workspace's tickets (see utils/workspaceScopedPool.js).
 */
export function makeReportRouter(makeController, pool) {
  const router = express.Router();

  // Staff only — customers previously could read agent performance, workload
  // and team stats for the whole organisation.
  router.use("/reports", verifyToken, requireStaff);

  const controllers = {};
  const scoped = (name) => async (req, res) => {
    try {
      const { workspace } = await resolveRequestWorkspace(req);
      controllers[workspace] ||= makeController(makeWorkspaceScopedPool(pool, workspace));
      return controllers[workspace][name](req, res);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error("[Reports]", err);
      return res.status(500).json({ error: "Failed to load report" });
    }
  };

  // Existing (enhanced)
  router.get("/reports/ticket-metrics", scoped("getTicketMetrics"));
  router.get("/reports/agent-performance", scoped("getAgentPerformance"));
  router.get("/reports/sla-compliance", scoped("getSlaCompliance"));
  router.get("/reports/customer-satisfaction", scoped("getCustomerSatisfaction"));
  router.get("/reports/ticket-trends", scoped("getTicketTrends"));

  // New endpoints
  router.get("/reports/team-performance", scoped("getTeamPerformance"));
  router.get("/reports/department-breakdown", scoped("getDepartmentBreakdown"));
  router.get("/reports/approval-metrics", scoped("getApprovalMetrics"));
  router.get("/reports/asset-summary", scoped("getAssetSummary"));
  router.get("/reports/resolution-distribution", scoped("getResolutionDistribution"));
  router.get("/reports/requester-activity", scoped("getRequesterActivity"));
  router.get("/reports/hourly-heatmap", scoped("getHourlyHeatmap"));

  // Vodafone dashboard-style widgets
  router.get("/reports/agent-workload", scoped("getAgentWorkload"));
  router.get("/reports/at-risk-tickets", scoped("getAtRiskTickets"));
  router.get("/reports/sla-priority-breakdown", scoped("getSlaPriorityBreakdown"));

  // Excel export
  router.get("/reports/export", requireRole("admin", "agent"), scoped("exportReport"));

  return router;
}
