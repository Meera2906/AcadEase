import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listAssessments,
  listAllAssessments,
  createAssessment,
  updateAssessment,
  togglePublishMarks,
  submitMarks,
  editSingleMark,
  getStudentMarks,
  getMyAssessments,
  getLeaderboard,
  getCourseMarksSummary,
  getAssessmentStudents,
} from "../controllers/assessmentController.js";
import { enterSemesterResult, getStudentResults, getStudentSessions, publishSemesterResult, uploadResultPdf, resultPdfUpload, previewSemesterResults, publishAllSemesterResults, submitResultForReview, rejectResult, listPendingResults } from "../controllers/resultController.js";

const router = Router();
router.use(requireAuth);

router.get("/assessments", requireRole("college_admin", "tnteu_admin"), asyncHandler(listAllAssessments));
router.get("/assessments/mine", asyncHandler(getMyAssessments));
router.get("/assessments/course/:courseId", asyncHandler(listAssessments));
router.post("/assessments", requireRole("faculty"), asyncHandler(createAssessment));
router.patch("/assessments/:id", requireRole("faculty"), asyncHandler(updateAssessment));
router.patch("/assessments/:id/publish", requireRole("college_admin", "tnteu_admin"), asyncHandler(togglePublishMarks));

router.post("/marks/:assessmentId", requireRole("faculty"), asyncHandler(submitMarks));
router.patch("/marks/:assessmentId/:studentId", requireRole("faculty", "college_admin"), asyncHandler(editSingleMark));
router.get("/marks/student/:studentId", asyncHandler(getStudentMarks));
router.get("/marks/assessment/:assessmentId/students", requireRole("faculty", "college_admin"), asyncHandler(getAssessmentStudents));
router.get("/marks/assessment/:assessmentId/leaderboard", asyncHandler(getLeaderboard));
router.get("/marks/course/:courseId/summary", requireRole("faculty", "college_admin"), asyncHandler(getCourseMarksSummary));

router.post("/results/semester", requireRole("college_admin", "tnteu_admin"), asyncHandler(enterSemesterResult));
router.get("/results/pending-review", requireRole("college_admin", "tnteu_admin"), asyncHandler(listPendingResults));
router.get("/results/semester/preview", requireRole("college_admin", "tnteu_admin"), asyncHandler(previewSemesterResults));
router.post("/results/semester/publish-all", requireRole("college_admin", "tnteu_admin"), asyncHandler(publishAllSemesterResults));
router.post("/results/semester/:studentId/submit-review", requireRole("faculty"), asyncHandler(submitResultForReview));
router.post("/results/semester/:studentId/reject", requireRole("college_admin", "tnteu_admin"), asyncHandler(rejectResult));
router.post("/results/semester/:studentId/publish", requireRole("college_admin", "tnteu_admin", "faculty"), asyncHandler(publishSemesterResult));
router.post("/results/semester/:studentId/upload-pdf", requireRole("college_admin", "tnteu_admin", "faculty"), resultPdfUpload.single("pdf"), asyncHandler(uploadResultPdf));
router.get("/results/student/:studentId/sessions", asyncHandler(getStudentSessions));
router.get("/results/student/:studentId", asyncHandler(getStudentResults));

export default router;
