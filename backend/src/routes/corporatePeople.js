// src/routes/corporatePeople.js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireStaff, requireWorkspace } from "../middleware/workspace.js";

export function makeCorporatePeopleRouter(controller) {
  const router = Router();

  // Corporate staff only (customers never manage people), and only from the
  // corporate app. Finer rules — admins vs Service Delivery — live in the
  // controller. Path-scoped: every router is mounted at /api.
  router.use("/corporate", requireAuth, requireStaff, requireWorkspace("corporate"));

  router.get("/corporate/people", controller.list);
  router.post("/corporate/people/customers", controller.createCustomer);
  router.post("/corporate/people/staff", controller.createStaff);
  router.patch("/corporate/people/:id", controller.update);
  router.post("/corporate/people/:id/onboarding", controller.resendOnboarding);
  router.post("/corporate/people/:id/reset-password", controller.sendReset);

  router.get("/corporate/hierarchy", controller.hierarchy);

  return router;
}
