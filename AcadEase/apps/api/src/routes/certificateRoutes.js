import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  requestCertificate,
  listCertificateRequests,
  listStudentCertificateRequests,
  approveCertificateRequest,
  rejectCertificateRequest,
  downloadCertificate,
  verifyCertificate,
  revokeCertificate,
} from "../controllers/certificateController.js";

const router = Router();

// Public — must come before requireAuth
router.get("/verify/:certId", asyncHandler(verifyCertificate));

router.use(requireAuth);
router.post("/request", requireRole("student"), asyncHandler(requestCertificate));
router.get("/requests", requireRole("college_admin", "tnteu_admin"), asyncHandler(listCertificateRequests));
router.get("/requests/student/:studentId", asyncHandler(listStudentCertificateRequests));
router.patch("/request/:id/approve", requireRole("college_admin", "tnteu_admin"), asyncHandler(approveCertificateRequest));
router.patch("/request/:id/reject", requireRole("college_admin", "tnteu_admin"), asyncHandler(rejectCertificateRequest));
router.get("/download/:certId", asyncHandler(downloadCertificate));
router.patch("/:certId/revoke", requireRole("college_admin", "tnteu_admin"), asyncHandler(revokeCertificate));

export default router;
