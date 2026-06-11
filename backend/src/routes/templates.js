// src/routes/templates.js
import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export function makeTemplateRouter(controller) {
  const router = Router();

  // ── Categories ──
  router.get("/templates/categories", requireAuth, controller.getCategories);
  router.post("/templates/categories", requireAuth, requireAdmin, controller.createCategory);
  router.put("/templates/categories/:id", requireAuth, requireAdmin, controller.updateCategory);
  router.delete("/templates/categories/:id", requireAuth, requireAdmin, controller.deleteCategory);

  // ── Template Gallery (all authenticated users) ──
  router.get("/templates/gallery", requireAuth, controller.getTemplateGallery);

  // ── Templates CRUD ──
  router.get("/templates", requireAuth, controller.getTemplates);
  router.get("/templates/:id", requireAuth, controller.getTemplate);
  router.post("/templates", requireAuth, requireAdmin, controller.createTemplate);
  router.put("/templates/:id", requireAuth, requireAdmin, controller.updateTemplate);
  router.delete("/templates/:id", requireAuth, requireAdmin, controller.deleteTemplate);
  router.post("/templates/:id/duplicate", requireAuth, requireAdmin, controller.duplicateTemplate);

  // ── Template responses (per ticket) ──
  router.get("/tickets/:id/template-response", requireAuth, controller.getTicketTemplateResponse);

  return router;
}
