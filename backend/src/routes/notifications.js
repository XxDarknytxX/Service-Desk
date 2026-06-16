// src/routes/notifications.js
import express from "express";
import { verifyToken } from "../middleware/auth.js";

export function makeNotificationRouter(controller) {
  const router = express.Router();
  router.get("/notifications", verifyToken, controller.list);
  router.post("/notifications/read-all", verifyToken, controller.markAllRead);
  router.post("/notifications/:id/read", verifyToken, controller.markRead);
  return router;
}
