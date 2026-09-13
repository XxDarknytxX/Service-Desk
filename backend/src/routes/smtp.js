// src/routes/smtp.js
import express from "express";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

export function makeSmtpRouter(controller) {
  const router = express.Router();

  // Admin-only throughout: these expose relay hostnames and let a caller send
  // mail from the corporate domain.
  router.get("/settings/smtp", verifyToken, requireAdmin, controller.get);
  router.put("/settings/smtp", verifyToken, requireAdmin, controller.update);
  router.post("/settings/smtp/test", verifyToken, requireAdmin, controller.test);
  router.post("/settings/smtp/send-test", verifyToken, requireAdmin, controller.sendTest);

  return router;
}
