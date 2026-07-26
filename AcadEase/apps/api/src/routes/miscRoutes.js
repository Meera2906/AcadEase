import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listNotifications,
  markAllRead,
  markOneRead,
  subscribePush,
  getMe,
  updateMe,
  uploadResume,
  resumeUpload,
  listUsers,
  createUser,
  editUser,
  bulkImportUsers,
  getAdminDashboard,
  getStudentXp,
  getStudentProfile,
  getLeaderboard,
} from "../controllers/miscController.js";

const router = Router();
router.use(requireAuth);

router.get("/notifications", asyncHandler(listNotifications));
router.patch("/notifications/read-all", asyncHandler(markAllRead));
router.patch("/notifications/:id/read", asyncHandler(markOneRead));
router.post("/notifications/subscribe", asyncHandler(subscribePush));

router.get("/users/me", asyncHandler(getMe));
router.patch("/users/me", asyncHandler(updateMe));
router.post("/users/me/resume", resumeUpload.single("resume"), asyncHandler(uploadResume));

router.get("/admin/users", requireRole("admin", "superadmin"), asyncHandler(listUsers));
router.get("/admin/users/:userId", requireRole("admin", "superadmin", "faculty"), asyncHandler(getStudentProfile));
router.post("/admin/users", requireRole("superadmin"), asyncHandler(createUser));
router.patch("/admin/users/:id", requireRole("superadmin"), asyncHandler(editUser));
router.post("/admin/users/bulk-import", requireRole("superadmin"), asyncHandler(bulkImportUsers));
router.get("/admin/dashboard", requireRole("admin", "superadmin"), asyncHandler(getAdminDashboard));

router.get("/gamification/xp/:studentId", asyncHandler(getStudentXp));
router.get("/gamification/leaderboard", asyncHandler(getLeaderboard));

export default router;
