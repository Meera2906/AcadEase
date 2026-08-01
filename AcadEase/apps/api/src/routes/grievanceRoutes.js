import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  submitGrievance,
  getStudentGrievances,
  listGrievances,
  acknowledgeGrievance,
  resolveGrievance,
  rejectGrievance,
  rateGrievance,
  getCertificateImpact,
} from "../controllers/grievanceController.js";

const router = Router();
router.use(requireAuth);

router.post("/", requireRole("student"), asyncHandler(submitGrievance));
router.get("/student/:studentId", asyncHandler(getStudentGrievances));
router.get("/", requireRole("college_admin", "tnteu_admin"), asyncHandler(listGrievances));
router.patch("/:id/acknowledge", requireRole("college_admin", "tnteu_admin"), asyncHandler(acknowledgeGrievance));
router.get("/:id/certificate-impact", requireRole("college_admin", "tnteu_admin"), asyncHandler(getCertificateImpact));
router.patch("/:id/resolve", requireRole("college_admin", "tnteu_admin"), asyncHandler(resolveGrievance));
router.patch("/:id/reject", requireRole("college_admin", "tnteu_admin"), asyncHandler(rejectGrievance));
router.post("/:id/rating", requireRole("student"), asyncHandler(rateGrievance));

export default router;
