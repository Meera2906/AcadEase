import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireApplicantAuth } from "../middleware/auth.js";
import {
  applicantDocUpload,
  loadApplicantById,
  getApplicationOptions,
  registerApplicant,
  loginApplicant,
  refreshApplicantToken,
  logoutApplicant,
  getMyApplication,
  updateMyApplication,
  previewEligibility,
  uploadMyDocument,
  deleteMyDocument,
  submitMyApplication,
} from "../controllers/applicantController.js";

const router = Router();

// Registration and login are unauthenticated, so they get their own per-IP cap
// on top of the account lockout in the controller.
const gateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

router.get("/options", asyncHandler(getApplicationOptions));
router.post("/register", gateLimiter, asyncHandler(registerApplicant));
router.post("/login", gateLimiter, asyncHandler(loginApplicant));
router.post("/refresh", asyncHandler(refreshApplicantToken));
router.post("/logout", asyncHandler(logoutApplicant));

// Everything below is scoped to the one applicant the token belongs to —
// req.applicant is loaded by the guard, so no handler takes an applicant id
// from the request.
const applicantOnly = requireApplicantAuth(loadApplicantById);

router.get("/me", applicantOnly, asyncHandler(getMyApplication));
router.patch("/me", applicantOnly, asyncHandler(updateMyApplication));
router.get("/eligibility", applicantOnly, asyncHandler(previewEligibility));

router.post(
  "/documents",
  applicantOnly,
  (req, res, next) =>
    applicantDocUpload.single("file")(req, res, (err) => {
      if (!err) return next();
      return res.status(400).json({ error: err.message, stage: "upload", problems: [err.message] });
    }),
  asyncHandler(uploadMyDocument)
);
router.delete("/documents/:documentType", applicantOnly, asyncHandler(deleteMyDocument));
router.post("/submit", applicantOnly, asyncHandler(submitMyApplication));

export default router;
