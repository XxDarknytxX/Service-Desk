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

  // Password reset. Public by necessity — the user can't sign in. Living under
  // /auth/ puts them behind nginx's strict `auth` rate-limit zone.
  router.post("/auth/forgot-password", controller.forgotPassword);
  router.post("/auth/reset-password/validate", controller.validateResetToken);
  router.post("/auth/reset-password", controller.resetPassword);

  return router;
}
