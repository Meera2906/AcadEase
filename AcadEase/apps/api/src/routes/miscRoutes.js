import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listNotifications, markAllRead, markOneRead, subscribePush, streamNotifications,
  getMe, updateMe, uploadResume, deleteResume, resumeUpload,
  studyMaterialUpload,
  listUsers, createUser, editUser, bulkImportUsers,
  getAdminDashboard, getStudentProfile,
  listDepartments, createDepartment, updateDepartment,
  listCourses, createCourse, updateCourse, deleteCourse,
  listCirculars, createCircular, deleteCircular, listMyCirculars,
  uploadStudyMaterial, listStudyMaterials, deleteStudyMaterial, processPyqPractice,
  getAttendanceReport, getMarksReport,
  getStudentXp, getLeaderboard,
} from "../controllers/miscController.js";
import { getCollegeAnalytics } from "../controllers/analyticsController.js";
import { listUmisStudents, getUmisStudent, getUmisFilters } from "../controllers/umisController.js";

const router = Router();

// Notifications stream must be mounted before the global auth guard so it can accept the access token from the querystring.
router.get("/notifications/stream", streamNotifications);
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
router.get("/admin/users", requireRole("college_admin", "tnteu_admin"), asyncHandler(listUsers));
router.get("/admin/users/:userId", requireRole("college_admin", "tnteu_admin", "faculty"), asyncHandler(getStudentProfile));
router.post("/admin/users", requireRole("tnteu_admin"), asyncHandler(createUser));
router.patch("/admin/users/:id", requireRole("tnteu_admin"), asyncHandler(editUser));
router.post("/admin/users/bulk-import", requireRole("college_admin", "tnteu_admin"), asyncHandler(bulkImportUsers));

// Admin: dashboard
router.get("/admin/dashboard", requireRole("college_admin", "tnteu_admin", "faculty"), asyncHandler(getAdminDashboard));

// Admin: departments
router.get("/admin/departments", requireRole("college_admin", "tnteu_admin"), asyncHandler(listDepartments));
router.post("/admin/departments", requireRole("college_admin", "tnteu_admin"), asyncHandler(createDepartment));
router.patch("/admin/departments/:id", requireRole("college_admin", "tnteu_admin"), asyncHandler(updateDepartment));

// Admin: courses
router.get("/admin/courses", requireRole("college_admin", "tnteu_admin"), asyncHandler(listCourses));
router.post("/admin/courses", requireRole("college_admin", "tnteu_admin"), asyncHandler(createCourse));
router.patch("/admin/courses/:id", requireRole("college_admin", "tnteu_admin"), asyncHandler(updateCourse));
router.delete("/admin/courses/:id", requireRole("college_admin", "tnteu_admin"), asyncHandler(deleteCourse));

// Circular distribution. /announcements is the pre-rename spelling and stays
// mounted so older clients keep working.
const circularAuthors = requireRole("college_admin", "college_coordinator", "tnteu_admin", "faculty");
router.get("/admin/circulars", asyncHandler(listCirculars));
router.post("/admin/circulars", circularAuthors, asyncHandler(createCircular));
router.delete("/admin/circulars/:id", requireRole("college_admin", "tnteu_admin"), asyncHandler(deleteCircular));
router.get("/admin/announcements", asyncHandler(listCirculars));
router.post("/admin/announcements", circularAuthors, asyncHandler(createCircular));
router.delete("/admin/announcements/:id", requireRole("college_admin", "tnteu_admin"), asyncHandler(deleteCircular));

// The read-only feed for whoever is asking, filtered to their audience group.
router.get("/circulars", asyncHandler(listMyCirculars));
router.get("/announcements", asyncHandler(listMyCirculars));

// TNTEU only: college-wise analysis and the UMIS student register
router.get("/admin/analytics/colleges", requireRole("tnteu_admin"), asyncHandler(getCollegeAnalytics));
router.get("/umis/filters", requireRole("tnteu_admin"), asyncHandler(getUmisFilters));
router.get("/umis/students", requireRole("tnteu_admin"), asyncHandler(listUmisStudents));
router.get("/umis/students/:userId", requireRole("tnteu_admin"), asyncHandler(getUmisStudent));

// Study materials
router.post("/study-materials", requireRole("college_admin", "tnteu_admin", "faculty"), studyMaterialUpload.single("file"), asyncHandler(uploadStudyMaterial));
router.post("/study-materials/pyq-practice", studyMaterialUpload.single("file"), asyncHandler(processPyqPractice));
router.get("/study-materials", asyncHandler(listStudyMaterials));
router.delete("/study-materials/:id", requireRole("college_admin", "tnteu_admin", "faculty"), asyncHandler(deleteStudyMaterial));

// Admin: reports
router.get("/admin/reports/attendance", requireRole("college_admin", "tnteu_admin"), asyncHandler(getAttendanceReport));
router.get("/admin/reports/marks", requireRole("college_admin", "tnteu_admin"), asyncHandler(getMarksReport));

// Gamification
router.get("/gamification/xp/:studentId", asyncHandler(getStudentXp));
router.get("/gamification/leaderboard", asyncHandler(getLeaderboard));

export default router;
