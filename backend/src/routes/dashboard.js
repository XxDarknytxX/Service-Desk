// src/routes/dashboard.js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export function makeDashboardRouter(controller) {
  const router = Router();
  router.get("/dashboard", requireAuth, controller.summary);
  return router;
}
