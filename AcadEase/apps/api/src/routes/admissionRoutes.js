import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  admissionCsvUpload,
  admissionDocUpload,
  getAdmissionMeta,
  importApplicants,
  uploadDocuments,
  listApplicants,
  getApplicant,
  getVerificationQueue,
  getDocument,
  streamDocumentFile,
  verifyDocument,
  rejectDocument,
  bulkDecide,
  getAdmissionStats,
  listBatches,
  getBatch,
  enrollApplicant,
  getMyApplication,
} from "../controllers/admissionController.js";

const router = Router();

router.use(requireAuth);

const universityStaff = requireRole("college_admin", "college_coordinator", "tnteu_admin");
// Both institutions review, but at different stages of the same chain. Which
// stage a caller may act at is decided from their role inside the controller,
// never from the request — so this shared guard cannot let anyone act twice.
const reviewStaff = requireRole("college_admin", "college_coordinator", "tnteu_admin");

// Turn multer's own errors (size, count, type) into clean 400s instead of 500s.
function withUpload(middleware) {
  return (req, res, next) =>
    middleware(req, res, (err) => {
      if (!err) return next();
      const status = err instanceof multer.MulterError ? 400 : 400;
      return res.status(status).json({ error: err.message });
    });
}

router.get("/meta", asyncHandler(getAdmissionMeta));

// Student self-service — mounted before the staff-only routes.
router.get("/my-application", asyncHandler(getMyApplication));

// ── University admin: bulk submission ──────────────────────────────────────
router.post(
  "/batches/applicants",
  universityStaff,
  withUpload(admissionCsvUpload.single("file")),
  asyncHandler(importApplicants)
);
router.post(
  "/batches/documents",
  universityStaff,
  withUpload(admissionDocUpload.array("files", 40)),
  asyncHandler(uploadDocuments)
);
router.get("/batches", universityStaff, asyncHandler(listBatches));
router.get("/batches/:batchId", universityStaff, asyncHandler(getBatch));

// ── Applicants (scoped: a university only ever sees its own) ───────────────
router.get("/applicants", universityStaff, asyncHandler(listApplicants));
router.get("/applicants/:applicantId", universityStaff, asyncHandler(getApplicant));
router.post("/applicants/:applicantId/enroll", universityStaff, asyncHandler(enrollApplicant));

// ── Two-stage verification queue ───────────────────────────────────────────
// The same routes serve both reviewers. A university admin sees and can only
// act on documents at the "college" stage (their own applicants); TNTEU sees
// and can only act on documents the university has already approved.
router.get("/queue", reviewStaff, asyncHandler(getVerificationQueue));
router.post("/queue/bulk", reviewStaff, asyncHandler(bulkDecide));
router.get("/stats", universityStaff, asyncHandler(getAdmissionStats));
router.get("/documents/:id", universityStaff, asyncHandler(getDocument));
router.get("/documents/:id/file", universityStaff, asyncHandler(streamDocumentFile));
router.patch("/documents/:id/verify", reviewStaff, asyncHandler(verifyDocument));
router.patch("/documents/:id/reject", reviewStaff, asyncHandler(rejectDocument));

export default router;
