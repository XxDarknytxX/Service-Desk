// src/routes/tickets.js
import { Router } from "express";
import { body } from "express-validator";
import { requireAuth } from "../middleware/auth.js";

export function makeTicketRouter(controller) {
  const router = Router();

  router.get("/tickets", requireAuth, controller.list);
  router.get("/tickets/:id", requireAuth, controller.getById);

  router.post(
    "/tickets",
    requireAuth,
    [
      body("subject").isLength({ min: 3 }).withMessage("Subject is required"),
      body("teamId").optional().isInt().withMessage("Invalid team ID")
    ],
    controller.create
  );

  // Bulk operations (must be before /:id to avoid "bulk" matching as an ID)
  router.patch("/tickets/bulk", requireAuth, controller.bulkUpdate);

  router.patch("/tickets/:id", requireAuth, controller.update);

  // Quick actions
  router.post("/tickets/:id/assign", requireAuth, controller.assignToMe);
  router.post("/tickets/:id/escalate", requireAuth, controller.escalate);
  router.post("/tickets/:id/reassign", requireAuth, controller.reassign);

  // Multi-team support
  router.get("/tickets/:id/teams", requireAuth, controller.getTicketTeams);
  router.post("/tickets/:id/teams", requireAuth, controller.addTicketTeam);
  router.patch("/tickets/:id/teams/:teamId", requireAuth, controller.updateTicketTeam);
  router.delete("/tickets/:id/teams/:teamId", requireAuth, controller.removeTicketTeam);
  router.post("/tickets/:id/teams/:teamId/complete", requireAuth, controller.completeTeamWork);
  router.post("/tickets/:id/teams/:teamId/reopen", requireAuth, controller.reopenTeamWork);

  // SLA for individual ticket
  router.get("/tickets/:id/sla", requireAuth, controller.getTicketSla);

  // Comments
  router.get("/tickets/:id/comments", requireAuth, controller.listComments);
  router.post(
    "/tickets/:id/comments",
    requireAuth,
    [body("body").isLength({ min: 2 }).withMessage("Comment required")],
    controller.addComment
  );

  // Audit trail
  router.get("/tickets/:id/audit", requireAuth, controller.getAuditTrail);

  // Satisfaction ratings (CSAT)
  router.get("/tickets/:id/satisfaction", requireAuth, controller.getSatisfaction);
  router.post("/tickets/:id/satisfaction", requireAuth, controller.submitSatisfaction);

  // Tags
  router.get("/tickets/:id/tags", requireAuth, controller.getTags);
  router.post("/tickets/:id/tags", requireAuth, controller.addTag);
  router.delete("/tickets/:id/tags/:tagId", requireAuth, controller.removeTag);

  // Global tags list
  router.get("/tags", requireAuth, controller.listTags);

  return router;
}
