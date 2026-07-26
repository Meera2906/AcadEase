import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getStudentAttendance,
  getStudentSummary,
  getCourseAttendanceSheet,
  markAttendance,
  editAttendanceRecord,
  getCourseAnalytics,
  submitOdRequest,
  getPendingOdRequests,
  getStudentOdRequests,
  reviewOdRequest,
} from "../controllers/attendanceController.js";

const router = Router();
router.use(requireAuth);

router.get("/student/:studentId", asyncHandler(getStudentAttendance));
router.get("/student/:studentId/summary", asyncHandler(getStudentSummary));
router.get("/course/:courseId/date/:date", requireRole("faculty", "admin"), asyncHandler(getCourseAttendanceSheet));
router.post("/mark", requireRole("faculty"), asyncHandler(markAttendance));
router.patch("/:recordId", requireRole("faculty", "admin"), asyncHandler(editAttendanceRecord));
router.get("/course/:courseId/analytics", requireRole("faculty", "admin"), asyncHandler(getCourseAnalytics));

router.post("/od-request", requireRole("student"), asyncHandler(submitOdRequest));
router.get("/od-requests", requireRole("faculty"), asyncHandler(getPendingOdRequests));
router.get("/od-requests/student/:studentId", asyncHandler(getStudentOdRequests));
router.patch("/od-request/:id", requireRole("faculty"), asyncHandler(reviewOdRequest));

export default router;
