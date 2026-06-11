// src/routes/assets.js
import express from "express";
import { verifyToken } from "../middleware/auth.js";

export function makeAssetRouter(controller) {
  const router = express.Router();
  const t = verifyToken;

  // Stats
  router.get("/assets/stats",                t, controller.getAssetStats);

  // Categories
  router.get("/assets/categories",           t, controller.getAssetCategories);
  router.post("/assets/categories",          t, controller.createAssetCategory);
  router.put("/assets/categories/:id",       t, controller.updateAssetCategory);
  router.delete("/assets/categories/:id",    t, controller.deleteAssetCategory);

  // Types
  router.get("/assets/types",                t, controller.getAssetTypes);
  router.post("/assets/types",               t, controller.createAssetType);
  router.put("/assets/types/:id",            t, controller.updateAssetType);
  router.delete("/assets/types/:id",         t, controller.deleteAssetType);

  // Bulk operations
  router.post("/assets/bulk",                t, controller.bulkUpdateAssets);

  // Ticket links
  router.post("/assets/link-ticket",         t, controller.linkAssetToTicket);
  router.delete("/assets/unlink-ticket",     t, controller.unlinkAssetFromTicket);

  // All assignments (checkout history)
  router.get("/assets/assignments",          t, controller.getAssignments);

  // All maintenance
  router.get("/assets/maintenance",          t, controller.getMaintenance);
  router.post("/assets/maintenance",         t, controller.createMaintenance);
  router.put("/assets/maintenance/:id",      t, controller.updateMaintenance);
  router.delete("/assets/maintenance/:id",   t, controller.deleteMaintenance);

  // Single asset CRUD
  router.get("/assets",                      t, controller.getAssets);
  router.post("/assets",                     t, controller.createAsset);
  router.get("/assets/:id",                  t, controller.getAsset);
  router.put("/assets/:id",                  t, controller.updateAsset);
  router.delete("/assets/:id",               t, controller.deleteAsset);

  // Per-asset sub-resources
  router.post("/assets/:id/checkout",        t, controller.checkoutAsset);
  router.post("/assets/:id/checkin",         t, controller.checkinAsset);
  router.get("/assets/:id/assignments",      t, controller.getAssetAssignments);
  router.get("/assets/:id/maintenance",      t, controller.getAssetMaintenance);
  router.get("/assets/:id/tickets",          t, controller.getAssetTickets);

  return router;
}
