import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  login,
  verifyTotp,
  setupTotp,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.post("/verify-totp", asyncHandler(verifyTotp));
router.post("/setup-totp", asyncHandler(setupTotp));
router.post("/refresh", asyncHandler(refresh));
router.post("/logout", requireAuth, asyncHandler(logout));
router.post("/forgot-password", asyncHandler(forgotPassword));
router.post("/reset-password/:token", asyncHandler(resetPassword));

export default router;
