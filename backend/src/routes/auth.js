// src/routes/auth.js
import { Router } from "express";
import { body } from "express-validator";
import { requireAuth } from "../middleware/auth.js";

export function makeAuthRouter(controller) {
  const router = Router();

  router.post(
    "/auth/register",
    [
      body("email").isEmail().withMessage("Valid email required"),
      body("password").isLength({ min: 6 }).withMessage("Password >= 6 chars"),
      body("fullName").optional().isLength({ min: 2 }).withMessage("Name too short"),
    ],
    controller.register
  );

  router.post(
    "/auth/login",
    [
      body("email").isEmail().withMessage("Valid email required"),
      body("password").notEmpty().withMessage("Password required"),
    ],
    controller.login
  );

  router.get("/auth/me", requireAuth, controller.me);

  return router;
}
