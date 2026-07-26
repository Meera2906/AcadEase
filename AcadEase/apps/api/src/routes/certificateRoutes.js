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
router.get("/requests", requireRole("admin", "superadmin"), asyncHandler(listCertificateRequests));
router.get("/requests/student/:studentId", asyncHandler(listStudentCertificateRequests));
router.patch("/request/:id/approve", requireRole("admin", "superadmin"), asyncHandler(approveCertificateRequest));
router.patch("/request/:id/reject", requireRole("admin", "superadmin"), asyncHandler(rejectCertificateRequest));
router.get("/download/:certId", asyncHandler(downloadCertificate));
router.patch("/:certId/revoke", requireRole("admin", "superadmin"), asyncHandler(revokeCertificate));

export default router;
