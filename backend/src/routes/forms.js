// src/routes/forms.js
import express from "express";
import { verifyToken, requireAgent } from "../middleware/auth.js";

export function makeFormsRouter(controller) {
  const router = express.Router();

  // ── Admin / agent management ──
  router.get("/forms", verifyToken, requireAgent, controller.list);
  router.post("/forms", verifyToken, requireAgent, controller.create);
  router.get("/forms/:id", verifyToken, requireAgent, controller.getOne);
  router.put("/forms/:id", verifyToken, requireAgent, controller.update);
  router.delete("/forms/:id", verifyToken, requireAgent, controller.remove);

  router.post("/forms/:id/invites", verifyToken, requireAgent, controller.createInvite);
  router.delete("/forms/invites/:inviteId", verifyToken, requireAgent, controller.revokeInvite);
  router.get("/forms/:id/submissions", verifyToken, requireAgent, controller.submissions);

  // Forms linked to a ticket (ticket detail panel)
  router.get("/tickets/:ticketId/forms", verifyToken, requireAgent, controller.ticketInvites);

  // ── Public token endpoints (no auth — link is the credential) ──
  router.get("/public/forms/:token", controller.publicGet);
  router.post("/public/forms/:token/submit", controller.publicSubmit);

  return router;
}
