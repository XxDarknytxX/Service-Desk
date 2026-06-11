// src/routes/kb.js
import express from "express";
import { verifyToken } from "../middleware/auth.js";

export function makeKbRouter(controller) {
  const router = express.Router();

  // Categories
  router.get("/kb/categories", verifyToken, controller.getCategories);
  router.post("/kb/categories", verifyToken, controller.createCategory);
  router.put("/kb/categories/:id", verifyToken, controller.updateCategory);
  router.delete("/kb/categories/:id", verifyToken, controller.deleteCategory);

  // Articles
  router.get("/kb/articles", verifyToken, controller.getArticles);
  router.get("/kb/articles/search", verifyToken, controller.searchArticles);
  router.get("/kb/articles/:id", verifyToken, controller.getArticle);
  router.post("/kb/articles", verifyToken, controller.createArticle);
  router.put("/kb/articles/:id", verifyToken, controller.updateArticle);
  router.delete("/kb/articles/:id", verifyToken, controller.deleteArticle);

  return router;
}
