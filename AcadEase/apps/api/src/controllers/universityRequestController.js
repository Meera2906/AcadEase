import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { fileURLToPath } from "url";
import { UniversityRequest, UNIVERSITY_REQUEST_TYPES, College, User, AuditLog } from "../models/index.js";
import { sha256 } from "../utils/admissionRules.js";
import { inspectUpload, SIZE_LIMITS } from "../utils/imageInspect.js";
import { encryptDocument, decryptDocument, describeAccess, DecryptionDeniedError } from "../utils/documentCrypto.js";
import { signApproval, verifyChain, lastSignature, keyIdForActor } from "../utils/approvalChain.js";
import { pushNotification } from "../utils/notify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_ROOT = path.resolve(__dirname, "../../secure-storage/university-requests");
if (!fs.existsSync(SECURE_ROOT)) fs.mkdirSync(SECURE_ROOT, { recursive: true });

export const universityRequestUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SIZE_LIMITS.maxBytes, files: 8 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    if ([".pdf", ".jpg", ".jpeg", ".png"].includes(ext) && ["application/pdf", "image/jpeg", "image/png"].includes(mime)) {
      return cb(null, true);
    }
    cb(new Error("Attach PDF, JPG or PNG files only"));
  },
});

const isTnteu = (req) => req.user.role === "tnteu_admin";
const ownCollegeId = (req) => req.user.collegeId || req.user.institutionId || null;

function scoped(req, filter = {}) {
  const query = { ...filter };
  if (isTnteu(req)) {
    if (req.query?.collegeId) query.collegeId = String(req.query.collegeId);
    return query;
  }
  const collegeId = ownCollegeId(req);
  if (!collegeId) {
    throw Object.assign(new Error("Your account is not linked to a university"), { status: 403 });
  }
  query.collegeId = collegeId;
  return query;
}

function canTouch(req, record) {
  if (!record) return false;
  return isTnteu(req) || record.collegeId === ownCollegeId(req);
}

function pagination(req, defaultLimit = 20) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

async function audit(req, action, request, metadata = {}) {
  try {
    await AuditLog.create({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action,
      collegeId: request.collegeId,
      targetType: "UniversityRequest",
      targetId: request.requestId,
      metadata: { type: request.type, ...metadata },
    });
  } catch {
    // best effort
  }
}

function notifyRole(collegeId, roles, payload) {
  const filter = collegeId ? { collegeId, role: { $in: roles } } : { role: { $in: roles } };
  return User.find(filter)
    .select("userId")
    .lean()
    .then((users) =>
      Promise.all(users.map((u) => pushNotification({ userId: u.userId, type: "announcement", ...payload }).catch(() => {})))
    )
    .catch(() => {});
}

// GET /api/university-requests/types
export async function getRequestTypes(req, res) {
  res.json({
    types: Object.entries(UNIVERSITY_REQUEST_TYPES).map(([type, meta]) => ({ type, ...meta })),
  });
}

// POST /api/university-requests
export async function createRequest(req, res) {
  const collegeId = isTnteu(req) ? req.body.collegeId : ownCollegeId(req);
  if (!collegeId) return res.status(400).json({ error: "No university selected" });

  const { type, title, description, academicYear, details, priority } = req.body || {};
  if (!UNIVERSITY_REQUEST_TYPES[type]) {
    return res.status(400).json({ error: `type must be one of: ${Object.keys(UNIVERSITY_REQUEST_TYPES).join(", ")}` });
  }
  if (!title || String(title).trim().length < 5) return res.status(400).json({ error: "Give the request a title of at least 5 characters" });
  if (!description || String(description).trim().length < 20) {
    return res.status(400).json({ error: "Describe what you are asking for in at least 20 characters" });
  }

  const college = await College.findOne({ collegeId }).lean();
  if (!college) return res.status(400).json({ error: "Unknown university" });

  const requestId = `UR_${new Date().getFullYear()}_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const request = await UniversityRequest.create({
    requestId,
    collegeId,
    type,
    title: String(title).trim().slice(0, 200),
    description: String(description).trim().slice(0, 5000),
    academicYear: academicYear || null,
    details: details && typeof details === "object" && !Array.isArray(details) ? details : {},
    priority: priority === "urgent" ? "urgent" : "routine",
    status: "draft",
    submittedBy: req.user.userId,
  });

  await audit(req, "university_request_created", request, { title: request.title });
  res.status(201).json({ message: "Draft created — attach your documents, then submit", request });
}

// POST /api/university-requests/:requestId/attachments
export async function addAttachment(req, res) {
  const request = await UniversityRequest.findOne({ requestId: req.params.requestId });
  if (!request || !canTouch(req, request)) return res.status(404).json({ error: "Request not found" });
  if (!["draft", "clarification_requested"].includes(request.status)) {
    return res.status(409).json({ error: "Attachments can only be added while the request is open for editing" });
  }
  if (!req.file) return res.status(400).json({ error: "No file received" });

  const buffer = req.file.buffer;
  const mimeType = (req.file.mimetype || "").toLowerCase();

  const quality = inspectUpload(buffer, mimeType);
  if (!quality.ok) {
    return res.status(422).json({ error: "This file cannot be accepted", problems: quality.hardFailures });
  }

  // Same envelope encryption as admission proofs: sealed for TNTEU and for the
  // submitting college, nobody else.
  const { ciphertext, encryption } = encryptDocument(buffer, { collegeId: request.collegeId });
  const storedName = `${crypto.randomUUID()}.enc`;
  const collegeDir = path.join(SECURE_ROOT, request.collegeId.replace(/[^A-Za-z0-9_-]/g, "_"));
  if (!fs.existsSync(collegeDir)) fs.mkdirSync(collegeDir, { recursive: true });
  await fs.promises.writeFile(path.join(collegeDir, storedName), ciphertext);

  request.attachments.push({
    label: String(req.body.label || req.file.originalname || "Attachment").slice(0, 120),
    storedName,
    filePath: path.posix.join(request.collegeId.replace(/[^A-Za-z0-9_-]/g, "_"), storedName),
    originalName: path.basename(req.file.originalname || storedName).slice(0, 160),
    mimeType,
    size: buffer.length,
    fileHash: sha256(buffer),
    encryption,
    uploadedBy: req.user.userId,
  });
  await request.save();

  await audit(req, "university_request_attachment_added", request, { label: req.body.label });
  res.status(201).json({ message: "Attachment added and encrypted", request });
}

// GET /api/university-requests/:requestId/attachments/:attachmentId
export async function streamAttachment(req, res) {
  const request = await UniversityRequest.findOne({ requestId: req.params.requestId }).lean();
  if (!request || !canTouch(req, request)) return res.status(404).json({ error: "Request not found" });

  const attachment = (request.attachments || []).find((a) => String(a._id) === req.params.attachmentId);
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  const absolute = path.resolve(SECURE_ROOT, attachment.filePath);
  if (!absolute.startsWith(SECURE_ROOT + path.sep) || !fs.existsSync(absolute)) {
    return res.status(404).json({ error: "Stored file is missing" });
  }

  let plaintext;
  try {
    plaintext = decryptDocument(fs.readFileSync(absolute), attachment.encryption, {
      role: req.user.role,
      collegeId: ownCollegeId(req),
    });
  } catch (err) {
    if (err instanceof DecryptionDeniedError) return res.status(403).json({ error: err.message });
    return res.status(422).json({ error: "This attachment failed its integrity check" });
  }

  res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename="attachment${path.extname(attachment.originalName || "")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(plaintext);
}

// POST /api/university-requests/:requestId/submit
export async function submitRequest(req, res) {
  const request = await UniversityRequest.findOne({ requestId: req.params.requestId });
  if (!request || !canTouch(req, request)) return res.status(404).json({ error: "Request not found" });
  if (!["draft", "clarification_requested"].includes(request.status)) {
    return res.status(409).json({ error: "This request has already been submitted" });
  }

  request.status = "submitted";
  request.submittedAt = new Date();
  request.submittedBy = req.user.userId;
  await request.save();

  await audit(req, "university_request_submitted", request);
  await notifyRole(null, ["tnteu_admin"], {
    title: `New ${UNIVERSITY_REQUEST_TYPES[request.type].label} request`,
    message: `${request.collegeId} has submitted "${request.title}" for TNTEU's decision.`,
    linkTo: "/admin/university-requests",
  });

  res.json({ message: "Submitted to TNTEU", request });
}

// GET /api/university-requests
export async function listRequests(req, res) {
  const { page, limit, skip } = pagination(req);
  const filter = scoped(req);
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.type) filter.type = String(req.query.type);
  // TNTEU's default view is the work that is actually waiting on them.
  if (req.query.pending === "true") filter.status = { $in: ["submitted", "under_review"] };

  const [requests, total] = await Promise.all([
    UniversityRequest.find(filter)
      .select("-attachments.encryption")
      .sort({ priority: -1, submittedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UniversityRequest.countDocuments(filter),
  ]);

  const collegeIds = [...new Set(requests.map((r) => r.collegeId))];
  const colleges = await College.find({ collegeId: { $in: collegeIds } }).select("collegeId name").lean();
  const nameById = new Map(colleges.map((c) => [c.collegeId, c.name]));

  res.json({
    requests: requests.map((r) => ({
      ...r,
      typeLabel: UNIVERSITY_REQUEST_TYPES[r.type]?.label || r.type,
      collegeName: nameById.get(r.collegeId) || r.collegeId,
      attachmentCount: (r.attachments || []).length,
      attachments: undefined,
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

// GET /api/university-requests/:requestId
export async function getRequest(req, res) {
  const request = await UniversityRequest.findOne({ requestId: req.params.requestId }).lean();
  if (!request || !canTouch(req, request)) return res.status(404).json({ error: "Request not found" });

  const college = await College.findOne({ collegeId: request.collegeId }).select("name district bedSeats medSeats").lean();
  const chain = verifyChain(request.approvals || [], "university_request", request.requestId);

  res.json({
    request: {
      ...request,
      typeLabel: UNIVERSITY_REQUEST_TYPES[request.type]?.label || request.type,
      requiredDocuments: UNIVERSITY_REQUEST_TYPES[request.type]?.requiredDocuments || [],
      attachments: (request.attachments || []).map((a) => ({
        _id: a._id,
        label: a.label,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        fileHash: a.fileHash,
        uploadedAt: a.uploadedAt,
        readableBy: describeAccess(a.encryption),
      })),
    },
    college,
    signatureChain: chain,
  });
}

// POST /api/university-requests/:requestId/messages
export async function addMessage(req, res) {
  const request = await UniversityRequest.findOne({ requestId: req.params.requestId });
  if (!request || !canTouch(req, request)) return res.status(404).json({ error: "Request not found" });

  const body = String(req.body?.body || "").trim();
  if (body.length < 2) return res.status(400).json({ error: "Write a message first" });

  const actor = await User.findOne({ userId: req.user.userId }).select("name").lean();
  request.messages.push({
    authorId: req.user.userId,
    authorRole: req.user.role,
    authorName: actor?.name || req.user.userId,
    body: body.slice(0, 2000),
  });
  await request.save();

  const toTnteu = !isTnteu(req);
  await notifyRole(toTnteu ? null : request.collegeId, toTnteu ? ["tnteu_admin"] : ["college_admin", "college_coordinator"], {
    title: `Message on ${request.requestId}`,
    message: body.slice(0, 140),
    linkTo: toTnteu ? "/admin/university-requests" : "/admin/university-requests",
  });

  res.status(201).json({ message: "Sent", messages: request.messages });
}

// ---------------------------------------------------------------------------
// TNTEU decisions — signed, exactly like certificate approvals
// ---------------------------------------------------------------------------

async function decide(req, res, decision) {
  const request = await UniversityRequest.findOne({ requestId: req.params.requestId });
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (!["submitted", "under_review", "clarification_requested"].includes(request.status)) {
    return res.status(409).json({ error: `This request is already ${request.status}` });
  }

  const note = String(req.body?.note || "").trim();
  if (decision === "rejected" && note.length < 5) {
    return res.status(400).json({ error: "A rejection needs a reason of at least 5 characters" });
  }

  const actor = await User.findOne({ userId: req.user.userId }).select("name").lean();
  const approval = signApproval({
    subjectType: "university_request",
    subjectId: request.requestId,
    stage: "tnteu_decision",
    decision,
    actorId: req.user.userId,
    actorName: actor?.name || req.user.userId,
    actorRole: req.user.role,
    keyId: keyIdForActor(req.user),
    remarks: note,
    previousSignature: lastSignature(request.approvals),
  });

  request.approvals.push(approval);
  request.status = decision === "approved" ? "approved" : "rejected";
  request.reviewedBy = req.user.userId;
  request.reviewedAt = new Date();
  request.decisionNote = note;
  await request.save();

  await audit(req, `university_request_${decision}`, request, { note, payloadDigest: approval.payloadDigest });
  await notifyRole(request.collegeId, ["college_admin", "college_coordinator"], {
    title: `TNTEU ${decision} your request`,
    message: `"${request.title}" was ${decision} by TNTEU.${note ? ` ${note}` : ""}`,
    linkTo: "/admin/university-requests",
  });

  res.json({
    message: `Request ${decision}`,
    request,
    // The signed order the college can now show to anyone.
    order: {
      requestId: request.requestId,
      decision,
      signedBy: approval.actorName,
      authority: "TNTEU",
      keyFingerprint: approval.keyFingerprint,
      algorithm: approval.algorithm,
      decidedAt: approval.decidedAt,
    },
  });
}

export const approveRequest = (req, res) => decide(req, res, "approved");
export const rejectRequest = (req, res) => decide(req, res, "rejected");

// PATCH /api/university-requests/:requestId/clarify
export async function requestClarification(req, res) {
  const request = await UniversityRequest.findOne({ requestId: req.params.requestId });
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (["approved", "rejected"].includes(request.status)) {
    return res.status(409).json({ error: "This request is already decided" });
  }

  const note = String(req.body?.note || "").trim();
  if (note.length < 5) return res.status(400).json({ error: "Say what clarification is needed" });

  const actor = await User.findOne({ userId: req.user.userId }).select("name").lean();
  request.status = "clarification_requested";
  request.messages.push({
    authorId: req.user.userId,
    authorRole: req.user.role,
    authorName: actor?.name || req.user.userId,
    body: note.slice(0, 2000),
  });
  await request.save();

  await audit(req, "university_request_clarification", request, { note });
  await notifyRole(request.collegeId, ["college_admin", "college_coordinator"], {
    title: "TNTEU needs more information",
    message: `"${request.title}": ${note.slice(0, 140)}`,
    linkTo: "/admin/university-requests",
  });

  res.json({ message: "Clarification requested", request });
}

// GET /api/university-requests/stats
export async function getRequestStats(req, res) {
  const base = scoped(req);

  const [byStatus, byType, perCollege, timing] = await Promise.all([
    UniversityRequest.aggregate([{ $match: base }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    UniversityRequest.aggregate([{ $match: base }, { $group: { _id: "$type", count: { $sum: 1 } } }]),
    UniversityRequest.aggregate([
      { $match: { ...base, status: { $in: ["submitted", "under_review", "clarification_requested"] } } },
      { $group: { _id: "$collegeId", pending: { $sum: 1 } } },
      { $sort: { pending: -1 } },
      { $limit: 15 },
    ]),
    UniversityRequest.aggregate([
      { $match: { ...base, reviewedAt: { $ne: null }, submittedAt: { $ne: null } } },
      { $project: { turnaround: { $subtract: ["$reviewedAt", "$submittedAt"] } } },
      { $group: { _id: null, avgMs: { $avg: "$turnaround" }, decided: { $sum: 1 } } },
    ]),
  ]);

  const status = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  res.json({
    status: {
      draft: status.draft || 0,
      submitted: status.submitted || 0,
      under_review: status.under_review || 0,
      clarification_requested: status.clarification_requested || 0,
      approved: status.approved || 0,
      rejected: status.rejected || 0,
    },
    byType: byType.map((t) => ({ type: t._id, label: UNIVERSITY_REQUEST_TYPES[t._id]?.label || t._id, count: t.count })),
    perCollege,
    avgDecisionDays: timing[0]?.avgMs ? Number((timing[0].avgMs / 864e5).toFixed(2)) : null,
    decidedTotal: timing[0]?.decided || 0,
  });
}
