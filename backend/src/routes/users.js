// src/routes/users.js
import { Router } from "express";
import { body } from "express-validator";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/auth.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export function makeUserRouter(controller) {
  const router = Router();

  router.get("/users", requireAuth, requireRole("admin", "agent"), controller.list);

  // Import routes — must be before /users/:id to avoid param matching
  router.get("/users/import-template", requireAuth, requireRole("admin"), controller.importTemplate);
  router.post("/users/import", requireAuth, requireRole("admin"), upload.single("file"), controller.importUsers);

  router.get("/users/:id", requireAuth, requireRole("admin", "agent"), controller.getById);

  router.post(
    "/users",
    requireAuth,
    requireRole("admin"),
    [
      body("email").isEmail().withMessage("Valid email required"),
      body("password").optional().isLength({ min: 6 }).withMessage("Password >= 6 chars"),
      body("full_name").optional().isLength({ min: 2 }).withMessage("Name too short"),
    ],
    controller.create
  );

  router.patch("/users/:id", requireAuth, requireRole("admin"), controller.update);

  router.delete("/users/:id", requireAuth, requireRole("admin"), controller.delete);

  return router;
}
