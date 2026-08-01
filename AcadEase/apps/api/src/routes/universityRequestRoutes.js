import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  universityRequestUpload,
  getRequestTypes,
  createRequest,
  addAttachment,
  streamAttachment,
  submitRequest,
  listRequests,
  getRequest,
  addMessage,
  approveRequest,
  rejectRequest,
  requestClarification,
  getRequestStats,
} from "../controllers/universityRequestController.js";

const router = Router();
router.use(requireAuth);

const universityStaff = requireRole("college_admin", "college_coordinator", "tnteu_admin");
const tnteuOnly = requireRole("tnteu_admin");

router.get("/types", universityStaff, asyncHandler(getRequestTypes));
router.get("/stats", universityStaff, asyncHandler(getRequestStats));

// ── College side: raise, attach, submit, discuss ───────────────────────────
router.get("/", universityStaff, asyncHandler(listRequests));
router.post("/", universityStaff, asyncHandler(createRequest));
router.get("/:requestId", universityStaff, asyncHandler(getRequest));
router.post(
  "/:requestId/attachments",
  universityStaff,
  (req, res, next) =>
    universityRequestUpload.single("file")(req, res, (err) =>
      err ? res.status(400).json({ error: err.message }) : next()
    ),
  asyncHandler(addAttachment)
);
router.get("/:requestId/attachments/:attachmentId", universityStaff, asyncHandler(streamAttachment));
router.post("/:requestId/submit", universityStaff, asyncHandler(submitRequest));
router.post("/:requestId/messages", universityStaff, asyncHandler(addMessage));

// ── TNTEU side: decide ─────────────────────────────────────────────────────
router.patch("/:requestId/approve", tnteuOnly, asyncHandler(approveRequest));
router.patch("/:requestId/reject", tnteuOnly, asyncHandler(rejectRequest));
router.patch("/:requestId/clarify", tnteuOnly, asyncHandler(requestClarification));

export default router;
