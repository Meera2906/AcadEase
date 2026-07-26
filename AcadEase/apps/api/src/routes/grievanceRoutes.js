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
} from "../controllers/grievanceController.js";

const router = Router();
router.use(requireAuth);

router.post("/", requireRole("student"), asyncHandler(submitGrievance));
router.get("/student/:studentId", asyncHandler(getStudentGrievances));
router.get("/", requireRole("admin", "superadmin"), asyncHandler(listGrievances));
router.patch("/:id/acknowledge", requireRole("admin", "superadmin"), asyncHandler(acknowledgeGrievance));
router.patch("/:id/resolve", requireRole("admin", "superadmin"), asyncHandler(resolveGrievance));
router.patch("/:id/reject", requireRole("admin", "superadmin"), asyncHandler(rejectGrievance));
router.post("/:id/rating", requireRole("student"), asyncHandler(rateGrievance));

export default router;
