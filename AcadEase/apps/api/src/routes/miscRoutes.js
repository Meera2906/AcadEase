import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listNotifications, markAllRead, markOneRead, subscribePush,
  getMe, updateMe, uploadResume, deleteResume, resumeUpload,
  studyMaterialUpload,
  listUsers, createUser, editUser, bulkImportUsers,
  getAdminDashboard, getStudentProfile,
  listDepartments, createDepartment, updateDepartment,
  listCourses, createCourse, updateCourse, deleteCourse,
  listAnnouncements, createAnnouncement, deleteAnnouncement,
  listStudentAnnouncements,
  uploadStudyMaterial, listStudyMaterials, deleteStudyMaterial, processPyqPractice,
  getAttendanceReport, getMarksReport,
  getStudentXp, getLeaderboard,
} from "../controllers/miscController.js";

const router = Router();
router.use(requireAuth);

// Notifications
router.get("/notifications", asyncHandler(listNotifications));
router.patch("/notifications/read-all", asyncHandler(markAllRead));
router.patch("/notifications/:id/read", asyncHandler(markOneRead));
router.post("/notifications/subscribe", asyncHandler(subscribePush));

// Current user
router.get("/users/me", asyncHandler(getMe));
router.patch("/users/me", asyncHandler(updateMe));
router.post("/users/me/resume", resumeUpload.single("resume"), asyncHandler(uploadResume));
router.delete("/users/me/resume", asyncHandler(deleteResume));

// Admin: user management
router.get("/admin/users", requireRole("admin", "superadmin"), asyncHandler(listUsers));
router.get("/admin/users/:userId", requireRole("admin", "superadmin", "faculty"), asyncHandler(getStudentProfile));
router.post("/admin/users", requireRole("superadmin"), asyncHandler(createUser));
router.patch("/admin/users/:id", requireRole("superadmin"), asyncHandler(editUser));
router.post("/admin/users/bulk-import", requireRole("superadmin"), asyncHandler(bulkImportUsers));

// Admin: dashboard
router.get("/admin/dashboard", requireRole("admin", "superadmin"), asyncHandler(getAdminDashboard));

// Admin: departments
router.get("/admin/departments", requireRole("admin", "superadmin"), asyncHandler(listDepartments));
router.post("/admin/departments", requireRole("admin", "superadmin"), asyncHandler(createDepartment));
router.patch("/admin/departments/:id", requireRole("admin", "superadmin"), asyncHandler(updateDepartment));

// Admin: courses
router.get("/admin/courses", requireRole("admin", "superadmin"), asyncHandler(listCourses));
router.post("/admin/courses", requireRole("admin", "superadmin"), asyncHandler(createCourse));
router.patch("/admin/courses/:id", requireRole("admin", "superadmin"), asyncHandler(updateCourse));
router.delete("/admin/courses/:id", requireRole("admin", "superadmin"), asyncHandler(deleteCourse));

// Admin: announcements
router.get("/admin/announcements", asyncHandler(listAnnouncements));
router.post("/admin/announcements", requireRole("admin", "superadmin", "faculty"), asyncHandler(createAnnouncement));
router.delete("/admin/announcements/:id", requireRole("admin", "superadmin"), asyncHandler(deleteAnnouncement));

// Student/Faculty: view announcements targeted to their role
router.get("/announcements", asyncHandler(listStudentAnnouncements));

// Study materials
router.post("/study-materials", requireRole("admin", "superadmin", "faculty"), studyMaterialUpload.single("file"), asyncHandler(uploadStudyMaterial));
router.post("/study-materials/pyq-practice", studyMaterialUpload.single("file"), asyncHandler(processPyqPractice));
router.get("/study-materials", asyncHandler(listStudyMaterials));
router.delete("/study-materials/:id", requireRole("admin", "superadmin", "faculty"), asyncHandler(deleteStudyMaterial));

// Admin: reports
router.get("/admin/reports/attendance", requireRole("admin", "superadmin"), asyncHandler(getAttendanceReport));
router.get("/admin/reports/marks", requireRole("admin", "superadmin"), asyncHandler(getMarksReport));

// Gamification
router.get("/gamification/xp/:studentId", asyncHandler(getStudentXp));
router.get("/gamification/leaderboard", asyncHandler(getLeaderboard));

export default router;
