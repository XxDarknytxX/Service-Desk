// src/routes/meta.js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export function makeMetaRouter(controller) {
  const router = Router();
  router.get("/meta", requireAuth, controller.meta);
  return router;
}
