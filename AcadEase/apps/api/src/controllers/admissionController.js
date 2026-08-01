import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import {
  Applicant,
  DocumentSubmission,
  AdmissionBatch,
  College,
  User,
  AuditLog,
} from "../models/index.js";
import { parseCsvRecords } from "../utils/csv.js";
import {
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  FLAG_LABELS,
  REQUIRED_DOCUMENTS,
  computeFlags,
  deriveApplicantStatus,
  isKnownDocumentType,
  requiredDocumentsFor,
  sha256,
} from "../utils/admissionRules.js";
import { EXPECTED_FIELDS, expectedFieldsFor, extractDocumentFields } from "../utils/documentExtract.js";
import { pushNotification } from "../utils/notify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Admission proofs are legal identity documents. They live outside
// `storage/` — which app.js serves statically — so the only way to read one is
// through the authorised, scope-checked stream endpoint below.
const SECURE_ROOT = path.resolve(__dirname, "../../secure-storage/admission-docs");
if (!fs.existsSync(SECURE_ROOT)) fs.mkdirSync(SECURE_ROOT, { recursive: true });

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 40;
const MAX_REPORT_ROWS = 500;

const ALLOWED_DOC_MIME = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_DOC_EXT = [".pdf", ".jpg", ".jpeg", ".png"];

// Files are buffered in memory so we can hash and pre-read them before deciding
// where — or whether — to persist them.
export const admissionDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_BATCH },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED_DOC_EXT.includes(ext) && ALLOWED_DOC_MIME.includes((file.mimetype || "").toLowerCase())) {
      return cb(null, true);
    }
    cb(new Error("Only PDF, JPG and PNG admission documents are accepted"));
  },
});

export const admissionCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ext === ".csv" || ext === ".txt") return cb(null, true);
    cb(new Error("Applicant lists must be uploaded as CSV"));
  },
});

// ---------------------------------------------------------------------------
// Scoping — a university admin must never reach another university's data.
// Enforced here, in the query, rather than by filtering results afterwards.
// ---------------------------------------------------------------------------

class ScopeError extends Error {
  constructor(message) {
    super(message);
    this.status = 403;
  }
}

function isTnteu(req) {
  return req.user?.role === "tnteu_admin";
}

function ownCollegeId(req) {
  return req.user?.collegeId || req.user?.institutionId || null;
}

function scoped(req, filter = {}) {
  const query = { ...filter };

  if (isTnteu(req)) {
    // TNTEU sees everything, but may narrow to one university.
    const requested = req.query?.collegeId;
    if (requested) query.collegeId = String(requested);
    return query;
  }

  const collegeId = ownCollegeId(req);
  if (!collegeId) throw new ScopeError("Your account is not linked to a university");
  query.collegeId = collegeId;
  return query;
}

function assertCanTouch(req, record) {
  if (!record) return false;
  if (isTnteu(req)) return true;
  return record.collegeId === ownCollegeId(req);
}

function pagination(req, defaultLimit = 25) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const rawLimit = Number.parseInt(req.query.limit, 10) || defaultLimit;
  const limit = Math.min(100, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
}

async function audit(req, action, { targetType, targetId, collegeId, metadata }) {
  try {
    await AuditLog.create({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action,
      collegeId: collegeId || ownCollegeId(req),
      targetType,
      targetId: targetId ? String(targetId) : null,
      metadata: metadata || {},
    });
  } catch {
    // Audit writes are best effort — they must never fail the operation the
    // reviewer just performed.
  }
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

// GET /api/admissions/meta
export async function getAdmissionMeta(req, res) {
  res.json({
    documentTypes: DOCUMENT_TYPES.map((type) => ({ type, label: DOCUMENT_LABELS[type] })),
    requiredDocuments: REQUIRED_DOCUMENTS,
    expectedFields: EXPECTED_FIELDS,
    flagLabels: FLAG_LABELS,
  });
}

// ---------------------------------------------------------------------------
// University admin: bulk applicant import
// ---------------------------------------------------------------------------

const APPLICANT_HEADER_ALIASES = {
  applicantid: "applicantId",
  applicant_id: "applicantId",
  id: "applicantId",
  name: "name",
  applicantname: "name",
  studentname: "name",
  program: "program",
  course: "program",
  dob: "dob",
  dateofbirth: "dob",
  gender: "gender",
  email: "email",
  phone: "phone",
  mobile: "phone",
  rollnumber: "rollNumber",
  rollno: "rollNumber",
  roll: "rollNumber",
  category: "category",
  community: "category",
};

function normalizeApplicantRow(record) {
  const row = {};
  Object.entries(record).forEach(([key, value]) => {
    if (key === "__row") return;
    const mapped = APPLICANT_HEADER_ALIASES[key];
    if (mapped) row[mapped] = String(value || "").trim();
  });
  row.__row = record.__row;
  return row;
}

function validateApplicantRow(row) {
  const errors = [];
  if (!row.applicantId) errors.push("applicantId is required");
  else if (!/^[A-Za-z0-9_-]{3,40}$/.test(row.applicantId)) errors.push("applicantId must be 3-40 letters, digits, _ or -");
  if (!row.name) errors.push("name is required");
  if (!row.program) errors.push("program is required");
  else if (!["BEd", "MEd"].includes(row.program)) errors.push('program must be "BEd" or "MEd"');
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("email is not a valid address");
  if (row.phone && !/^[0-9+\-\s]{6,15}$/.test(row.phone)) errors.push("phone is not a valid number");
  return errors;
}

// POST /api/admissions/batches/applicants   (multipart: file=<csv>)
export async function importApplicants(req, res) {
  if (!req.file) return res.status(400).json({ error: "A CSV file is required" });

  const collegeId = isTnteu(req) ? req.body.collegeId || ownCollegeId(req) : ownCollegeId(req);
  if (!collegeId) {
    return res.status(400).json({ error: "No university selected for this import" });
  }

  const college = await College.findOne({ collegeId }).lean();
  if (!college) return res.status(400).json({ error: `Unknown university: ${collegeId}` });

  const { records } = parseCsvRecords(req.file.buffer.toString("utf8"));
  if (!records.length) {
    return res.status(400).json({ error: "CSV must contain a header row and at least one applicant row" });
  }

  const batchId = `BATCH_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const rows = [];
  const toInsert = [];
  const seenInFile = new Set();

  // One round trip to find every applicantId in the file that already exists,
  // rather than a findOne per row.
  const candidateIds = records
    .map((record) => normalizeApplicantRow(record).applicantId)
    .filter(Boolean);
  const existing = await Applicant.find({ applicantId: { $in: candidateIds } })
    .select("applicantId collegeId")
    .lean();
  const existingIds = new Map(existing.map((item) => [item.applicantId, item.collegeId]));

  for (const record of records) {
    const row = normalizeApplicantRow(record);
    const errors = validateApplicantRow(row);

    if (row.applicantId && seenInFile.has(row.applicantId)) {
      errors.push("duplicate applicantId within this file");
    }
    if (row.applicantId && existingIds.has(row.applicantId)) {
      errors.push(
        existingIds.get(row.applicantId) === collegeId
          ? "applicantId already submitted by your university"
          : "applicantId already in use by another university"
      );
    }

    if (errors.length) {
      rows.push({ row: row.__row, applicantId: row.applicantId || null, name: row.name || null, outcome: "failed", errors });
      continue;
    }

    seenInFile.add(row.applicantId);
    toInsert.push({
      applicantId: row.applicantId,
      collegeId,
      batchId,
      name: row.name,
      program: row.program,
      dob: row.dob || null,
      gender: row.gender || null,
      email: row.email || null,
      phone: row.phone || null,
      rollNumber: row.rollNumber || null,
      category: row.category || null,
      status: "submitted",
      submittedAt: new Date(),
      submittedBy: req.user.userId,
    });
    rows.push({
      row: row.__row,
      applicantId: row.applicantId,
      name: row.name,
      outcome: "imported",
      errors: [],
      requiredDocuments: requiredDocumentsFor(row.program),
    });
  }

  let imported = 0;
  if (toInsert.length) {
    const result = await Applicant.insertMany(toInsert, { ordered: false }).catch((err) => err?.insertedDocs || []);
    imported = Array.isArray(result) ? result.length : 0;
  }

  const failed = rows.filter((row) => row.outcome === "failed").length;
  const reportRows = rows.slice(0, MAX_REPORT_ROWS);

  await AdmissionBatch.create({
    batchId,
    collegeId,
    uploadedBy: req.user.userId,
    kind: "applicants",
    fileName: path.basename(req.file.originalname || "applicants.csv"),
    totalRows: rows.length,
    imported,
    failed,
    flagged: 0,
    rows: reportRows,
    truncatedRows: Math.max(0, rows.length - reportRows.length),
  });

  await audit(req, "admission_import_applicants", {
    targetType: "AdmissionBatch",
    targetId: batchId,
    collegeId,
    metadata: { totalRows: rows.length, imported, failed },
  });

  res.status(201).json({
    batchId,
    totalRows: rows.length,
    imported,
    failed,
    rows: reportRows,
    truncatedRows: Math.max(0, rows.length - reportRows.length),
    message: `${imported} applicant(s) imported, ${failed} row(s) rejected.`,
  });
}

// ---------------------------------------------------------------------------
// University admin: bulk document upload
// ---------------------------------------------------------------------------

// Files are matched to an applicant by name: "<applicantId>__<documentType>.pdf".
// The roll number works in place of the applicant ID.
function parseDocumentFileName(originalName = "") {
  const base = path.basename(originalName, path.extname(originalName));
  const separator = base.includes("__") ? "__" : "_";
  const parts = base.split(separator);
  if (parts.length < 2) return null;

  // Document types themselves contain underscores, so try progressively
  // shorter prefixes as the applicant key.
  for (let split = parts.length - 1; split >= 1; split -= 1) {
    const key = parts.slice(0, split).join(separator);
    const type = parts.slice(split).join("_").toLowerCase();
    if (isKnownDocumentType(type)) return { key, documentType: type };
  }
  return null;
}

async function persistDocument({ req, applicant, documentType, file, batchId }) {
  const buffer = file.buffer;
  const fileHash = sha256(buffer);

  const hashMatches = await DocumentSubmission.find({ fileHash })
    .select("applicantId collegeId documentType createdAt")
    .lean();

  const { extractedFields, extractionSource } = await extractDocumentFields(
    buffer,
    (file.mimetype || "").toLowerCase(),
    documentType
  );

  const { flags, flagDetails } = computeFlags({
    applicant,
    extractedFields,
    extractionSource,
    hashMatches,
    expectedFields: expectedFieldsFor(documentType),
  });

  // Never reuse the client-supplied filename; it is kept only as a label.
  const ext = path.extname(file.originalname || "").toLowerCase();
  const storedName = `${crypto.randomUUID()}${ext}`;
  const collegeDir = path.join(SECURE_ROOT, applicant.collegeId.replace(/[^A-Za-z0-9_-]/g, "_"));
  if (!fs.existsSync(collegeDir)) fs.mkdirSync(collegeDir, { recursive: true });
  const absolutePath = path.join(collegeDir, storedName);
  await fs.promises.writeFile(absolutePath, buffer);

  const payload = {
    applicantId: applicant.applicantId,
    collegeId: applicant.collegeId,
    documentType,
    storedName,
    filePath: path.relative(SECURE_ROOT, absolutePath).split(path.sep).join("/"),
    originalName: path.basename(file.originalname || storedName).slice(0, 160),
    mimeType: (file.mimetype || "").toLowerCase(),
    size: buffer.length,
    fileHash,
    extractedFields,
    extractionSource,
    fieldsConfirmedBy: null,
    flags,
    flagDetails,
    flagCount: flags.length,
    status: "pending",
    verifiedBy: null,
    verifiedAt: null,
    rejectionReason: null,
    uploadedBy: req.user.userId,
    batchId,
  };

  // Re-uploading a document type replaces the previous file and resets it to
  // pending — a resubmission has to be looked at again.
  const previous = await DocumentSubmission.findOneAndUpdate(
    { applicantId: applicant.applicantId, documentType },
    { $set: payload },
    { upsert: true, new: false }
  );

  if (previous?.storedName && previous.storedName !== storedName) {
    const oldPath = path.join(SECURE_ROOT, previous.filePath);
    fs.promises.unlink(oldPath).catch(() => {});
  }

  return { flags, replaced: Boolean(previous) };
}

// POST /api/admissions/batches/documents   (multipart: files=<...>)
export async function uploadDocuments(req, res) {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "At least one document file is required" });

  const explicitApplicantId = req.body.applicantId ? String(req.body.applicantId).trim() : null;
  const explicitDocumentType = req.body.documentType ? String(req.body.documentType).trim() : null;

  if (explicitApplicantId && files.length > 1) {
    return res.status(400).json({ error: "Upload one file at a time when specifying an applicant explicitly" });
  }

  const batchId = `DOCS_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const rows = [];
  let imported = 0;
  let flaggedCount = 0;

  // Resolve every referenced applicant in one query, scoped to the caller's
  // university so a mislabelled file can never attach to a foreign applicant.
  const keys = new Set();
  files.forEach((file) => {
    if (explicitApplicantId) {
      keys.add(explicitApplicantId);
      return;
    }
    const parsed = parseDocumentFileName(file.originalname);
    if (parsed) keys.add(parsed.key);
  });

  const applicants = keys.size
    ? await Applicant.find(
        scoped(req, { $or: [{ applicantId: { $in: [...keys] } }, { rollNumber: { $in: [...keys] } }] })
      ).lean()
    : [];

  const byKey = new Map();
  applicants.forEach((applicant) => {
    byKey.set(applicant.applicantId, applicant);
    if (applicant.rollNumber) byKey.set(applicant.rollNumber, applicant);
  });

  const touchedApplicants = new Set();

  for (const file of files) {
    const parsed = explicitApplicantId
      ? { key: explicitApplicantId, documentType: explicitDocumentType }
      : parseDocumentFileName(file.originalname);

    const label = path.basename(file.originalname || "file");

    if (!parsed || !parsed.documentType) {
      rows.push({
        file: label,
        outcome: "failed",
        errors: [`Cannot tell which applicant/document this is. Name files "<applicantId>__<documentType>.pdf" (e.g. APP001__10th_marksheet.pdf).`],
      });
      continue;
    }

    if (!isKnownDocumentType(parsed.documentType)) {
      rows.push({
        file: label,
        outcome: "failed",
        errors: [`Unknown document type "${parsed.documentType}". Allowed: ${DOCUMENT_TYPES.join(", ")}`],
      });
      continue;
    }

    const applicant = byKey.get(parsed.key);
    if (!applicant) {
      rows.push({
        file: label,
        outcome: "failed",
        errors: [`No applicant "${parsed.key}" found for your university. Import the applicant CSV first.`],
      });
      continue;
    }

    try {
      const { flags } = await persistDocument({ req, applicant, documentType: parsed.documentType, file, batchId });
      imported += 1;
      if (flags.length) flaggedCount += 1;
      touchedApplicants.add(applicant.applicantId);
      rows.push({
        file: label,
        applicantId: applicant.applicantId,
        applicantName: applicant.name,
        documentType: parsed.documentType,
        outcome: flags.length ? "flagged" : "imported",
        flags,
        errors: [],
      });
    } catch (err) {
      rows.push({ file: label, outcome: "failed", errors: [err.message || "Failed to store document"] });
    }
  }

  for (const applicantId of touchedApplicants) {
    await refreshApplicantStatus(applicantId);
  }

  const failed = rows.filter((row) => row.outcome === "failed").length;
  const collegeId = applicants[0]?.collegeId || ownCollegeId(req);

  await AdmissionBatch.create({
    batchId,
    collegeId: collegeId || "UNKNOWN",
    uploadedBy: req.user.userId,
    kind: "documents",
    fileName: `${files.length} file(s)`,
    totalRows: rows.length,
    imported,
    failed,
    flagged: flaggedCount,
    rows: rows.slice(0, MAX_REPORT_ROWS),
    truncatedRows: Math.max(0, rows.length - MAX_REPORT_ROWS),
  });

  await audit(req, "admission_upload_documents", {
    targetType: "AdmissionBatch",
    targetId: batchId,
    collegeId,
    metadata: { total: rows.length, imported, failed, flagged: flaggedCount },
  });

  res.status(201).json({
    batchId,
    totalRows: rows.length,
    imported,
    failed,
    flagged: flaggedCount,
    rows: rows.slice(0, MAX_REPORT_ROWS),
    message: `${imported} document(s) stored (${flaggedCount} flagged for review), ${failed} rejected.`,
  });
}

// ---------------------------------------------------------------------------
// Applicants
// ---------------------------------------------------------------------------

// Recomputes and persists the applicant's derived status. Called after every
// document upload, verify and reject.
async function refreshApplicantStatus(applicantId, reviewer = null) {
  const applicant = await Applicant.findOne({ applicantId });
  if (!applicant) return null;

  const documents = await DocumentSubmission.find({ applicantId }).select("documentType status flags _id").lean();
  const derived = deriveApplicantStatus(applicant.program, documents);

  const changed = applicant.status !== derived.status;
  applicant.status = derived.status;

  if (derived.status === "rejected") {
    const rejectedDocs = await DocumentSubmission.find({ applicantId, status: "rejected" })
      .select("documentType rejectionReason")
      .lean();
    applicant.rejectionReason = rejectedDocs
      .map((doc) => `${DOCUMENT_LABELS[doc.documentType] || doc.documentType}: ${doc.rejectionReason || "rejected"}`)
      .join("; ");
  } else {
    applicant.rejectionReason = null;
  }

  if (["verified", "rejected"].includes(derived.status)) {
    applicant.reviewedAt = new Date();
    if (reviewer) applicant.reviewedBy = reviewer;
  }

  await applicant.save();
  return { applicant, derived, changed };
}

// GET /api/admissions/applicants
export async function listApplicants(req, res) {
  const { page, limit, skip } = pagination(req);
  const filter = scoped(req);

  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.program) filter.program = String(req.query.program);
  if (req.query.batchId) filter.batchId = String(req.query.batchId);
  if (req.query.q) {
    const safe = String(req.query.q).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [{ name: rx }, { applicantId: rx }, { rollNumber: rx }];
  }

  const [applicants, total] = await Promise.all([
    Applicant.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit).lean(),
    Applicant.countDocuments(filter),
  ]);

  // Checklist progress for the page's applicants only — one grouped query, not
  // one query per row and never the whole collection.
  const ids = applicants.map((applicant) => applicant.applicantId);
  const progress = await DocumentSubmission.aggregate([
    { $match: { applicantId: { $in: ids } } },
    {
      $group: {
        _id: "$applicantId",
        uploaded: { $sum: 1 },
        verified: { $sum: { $cond: [{ $eq: ["$status", "verified"] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        flagged: { $sum: { $cond: [{ $gt: ["$flagCount", 0] }, 1, 0] } },
      },
    },
  ]);
  const progressById = new Map(progress.map((item) => [item._id, item]));

  res.json({
    applicants: applicants.map((applicant) => {
      const stats = progressById.get(applicant.applicantId) || {};
      const requiredCount = requiredDocumentsFor(applicant.program).length;
      return {
        ...applicant,
        requiredCount,
        uploadedCount: stats.uploaded || 0,
        verifiedCount: stats.verified || 0,
        rejectedCount: stats.rejected || 0,
        flaggedCount: stats.flagged || 0,
      };
    }),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

// GET /api/admissions/applicants/:applicantId
export async function getApplicant(req, res) {
  const applicant = await Applicant.findOne({ applicantId: req.params.applicantId }).lean();
  if (!applicant || !assertCanTouch(req, applicant)) {
    return res.status(404).json({ error: "Applicant not found" });
  }

  const documents = await DocumentSubmission.find({ applicantId: applicant.applicantId })
    .sort({ flagCount: -1, createdAt: 1 })
    .lean();

  const derived = deriveApplicantStatus(applicant.program, documents);

  res.json({
    applicant,
    documents: documents.map((doc) => ({ ...doc, label: DOCUMENT_LABELS[doc.documentType] || doc.documentType })),
    checklist: derived.checklist,
    verifiedCount: derived.verifiedCount,
    requiredCount: derived.requiredCount,
  });
}

// ---------------------------------------------------------------------------
// TNTEU: the verification queue
// ---------------------------------------------------------------------------

// GET /api/admissions/queue
export async function getVerificationQueue(req, res) {
  const { page, limit, skip } = pagination(req);
  const filter = scoped(req, { status: req.query.status || "pending" });

  if (req.query.documentType) filter.documentType = String(req.query.documentType);
  if (req.query.flagged === "true") filter.flagCount = { $gt: 0 };
  if (req.query.flagged === "false") filter.flagCount = 0;

  // Flagged documents first, then oldest waiting — this is the order a
  // reviewer should work in, and it comes straight off the index.
  const [documents, total] = await Promise.all([
    DocumentSubmission.find(filter).sort({ flagCount: -1, createdAt: 1 }).skip(skip).limit(limit).lean(),
    DocumentSubmission.countDocuments(filter),
  ]);

  const applicantIds = [...new Set(documents.map((doc) => doc.applicantId))];
  const collegeIds = [...new Set(documents.map((doc) => doc.collegeId))];
  const [applicants, colleges] = await Promise.all([
    Applicant.find({ applicantId: { $in: applicantIds } }).select("applicantId name program status").lean(),
    College.find({ collegeId: { $in: collegeIds } }).select("collegeId name").lean(),
  ]);
  const applicantById = new Map(applicants.map((item) => [item.applicantId, item]));
  const collegeById = new Map(colleges.map((item) => [item.collegeId, item.name]));

  res.json({
    documents: documents.map((doc) => ({
      _id: doc._id,
      applicantId: doc.applicantId,
      applicantName: applicantById.get(doc.applicantId)?.name || null,
      program: applicantById.get(doc.applicantId)?.program || null,
      collegeId: doc.collegeId,
      collegeName: collegeById.get(doc.collegeId) || doc.collegeId,
      documentType: doc.documentType,
      label: DOCUMENT_LABELS[doc.documentType] || doc.documentType,
      flags: doc.flags,
      flagCount: doc.flagCount,
      status: doc.status,
      submittedAt: doc.createdAt,
      waitingHours: Math.round((Date.now() - new Date(doc.createdAt).getTime()) / 36e5),
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

// GET /api/admissions/documents/:id
export async function getDocument(req, res) {
  const doc = await DocumentSubmission.findById(req.params.id).lean();
  if (!doc || !assertCanTouch(req, doc)) return res.status(404).json({ error: "Document not found" });

  const applicant = await Applicant.findOne({ applicantId: doc.applicantId }).lean();
  const siblings = await DocumentSubmission.find({ applicantId: doc.applicantId })
    .select("documentType status flags flagCount")
    .lean();
  const derived = deriveApplicantStatus(applicant?.program, siblings);
  const college = await College.findOne({ collegeId: doc.collegeId }).select("name").lean();

  // Give the reviewer the other side of a duplicate-hash flag so they can see
  // exactly which applicant the same file was already used for.
  let duplicateOf = null;
  if (doc.flags?.includes("duplicate_hash")) {
    const match = await DocumentSubmission.findOne({ fileHash: doc.fileHash, _id: { $ne: doc._id } })
      .select("applicantId collegeId documentType createdAt status")
      .lean();
    if (match) {
      const other = await Applicant.findOne({ applicantId: match.applicantId }).select("name").lean();
      duplicateOf = { ...match, applicantName: other?.name || null };
    }
  }

  res.json({
    document: {
      ...doc,
      label: DOCUMENT_LABELS[doc.documentType] || doc.documentType,
      expectedFields: expectedFieldsFor(doc.documentType),
    },
    applicant,
    collegeName: college?.name || doc.collegeId,
    checklist: derived.checklist,
    verifiedCount: derived.verifiedCount,
    requiredCount: derived.requiredCount,
    duplicateOf,
    flagLabels: FLAG_LABELS,
  });
}

// GET /api/admissions/documents/:id/file
export async function streamDocumentFile(req, res) {
  const doc = await DocumentSubmission.findById(req.params.id).select("filePath mimeType collegeId originalName").lean();
  if (!doc || !assertCanTouch(req, doc)) return res.status(404).json({ error: "Document not found" });

  // filePath is server-generated, but resolve-and-check anyway so a tampered
  // record can never read outside the document root.
  const absolute = path.resolve(SECURE_ROOT, doc.filePath);
  if (!absolute.startsWith(SECURE_ROOT + path.sep) || !fs.existsSync(absolute)) {
    return res.status(404).json({ error: "Stored file is missing" });
  }

  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename="document${path.extname(absolute)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(absolute).pipe(res);
}

// PATCH /api/admissions/documents/:id/verify
export async function verifyDocument(req, res) {
  const doc = await DocumentSubmission.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.status === "verified") return res.status(409).json({ error: "Document is already verified" });

  // The reviewer's confirmed/corrected fields replace the assistive pre-fill.
  // Verification is only ever recorded against what a human confirmed.
  const confirmed = req.body?.extractedFields;
  if (confirmed && typeof confirmed === "object" && !Array.isArray(confirmed)) {
    const clean = {};
    Object.entries(confirmed)
      .slice(0, 30)
      .forEach(([key, value]) => {
        if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) clean[key] = String(value ?? "").slice(0, 200);
      });
    doc.extractedFields = clean;
  }

  doc.status = "verified";
  doc.verifiedBy = req.user.userId;
  doc.verifiedAt = new Date();
  doc.rejectionReason = null;
  doc.fieldsConfirmedBy = req.user.userId;
  await doc.save();

  const refreshed = await refreshApplicantStatus(doc.applicantId, req.user.userId);

  await audit(req, "admission_document_verified", {
    targetType: "DocumentSubmission",
    targetId: doc._id,
    collegeId: doc.collegeId,
    metadata: {
      applicantId: doc.applicantId,
      documentType: doc.documentType,
      flagsAtReview: doc.flags,
      applicantStatus: refreshed?.applicant?.status,
    },
  });

  if (refreshed?.changed && refreshed.applicant.status === "verified") {
    notifyCollegeAdmins(doc.collegeId, {
      title: "Applicant fully verified",
      message: `All required documents for ${refreshed.applicant.name} (${doc.applicantId}) are verified. You can now enrol them.`,
      linkTo: `/admin/admissions/applicants/${doc.applicantId}`,
    });
  }

  res.json({
    message: "Document verified",
    document: doc,
    applicantStatus: refreshed?.applicant?.status,
    verifiedCount: refreshed?.derived?.verifiedCount,
    requiredCount: refreshed?.derived?.requiredCount,
  });
}

// PATCH /api/admissions/documents/:id/reject
export async function rejectDocument(req, res) {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 5) {
    return res.status(400).json({ error: "A rejection reason of at least 5 characters is required" });
  }

  const doc = await DocumentSubmission.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  doc.status = "rejected";
  doc.verifiedBy = req.user.userId;
  doc.verifiedAt = new Date();
  doc.rejectionReason = reason.slice(0, 500);
  await doc.save();

  const refreshed = await refreshApplicantStatus(doc.applicantId, req.user.userId);

  await audit(req, "admission_document_rejected", {
    targetType: "DocumentSubmission",
    targetId: doc._id,
    collegeId: doc.collegeId,
    metadata: {
      applicantId: doc.applicantId,
      documentType: doc.documentType,
      reason: doc.rejectionReason,
      flagsAtReview: doc.flags,
    },
  });

  notifyCollegeAdmins(doc.collegeId, {
    title: "Document rejected by TNTEU",
    message: `${DOCUMENT_LABELS[doc.documentType] || doc.documentType} for ${doc.applicantId} was rejected: ${doc.rejectionReason}`,
    linkTo: `/admin/admissions/applicants/${doc.applicantId}`,
  });

  res.json({
    message: "Document rejected",
    document: doc,
    applicantStatus: refreshed?.applicant?.status,
  });
}

function notifyCollegeAdmins(collegeId, payload) {
  // Fire and forget — a notification failure must not roll back a review.
  User.find({ collegeId, role: { $in: ["college_admin", "college_coordinator"] } })
    .select("userId")
    .lean()
    .then((admins) =>
      Promise.all(
        admins.map((admin) =>
          pushNotification({ userId: admin.userId, type: "admission", ...payload }).catch(() => {})
        )
      )
    )
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Dashboards — aggregated in the database, never by loading documents
// ---------------------------------------------------------------------------

// GET /api/admissions/stats
export async function getAdmissionStats(req, res) {
  const base = scoped(req);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [byStatus, perCollege, throughput, timing, applicantsByStatus, colleges] = await Promise.all([
    DocumentSubmission.aggregate([{ $match: base }, { $group: { _id: "$status", count: { $sum: 1 } } }]),

    DocumentSubmission.aggregate([
      { $match: { ...base, status: "pending" } },
      { $group: { _id: "$collegeId", pending: { $sum: 1 }, flagged: { $sum: { $cond: [{ $gt: ["$flagCount", 0] }, 1, 0] } } } },
      { $sort: { pending: -1 } },
      { $limit: 20 },
    ]),

    DocumentSubmission.aggregate([
      { $match: { ...base, verifiedAt: { $gte: sevenDaysAgo }, status: { $in: ["verified", "rejected"] } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$verifiedAt" } },
          verified: { $sum: { $cond: [{ $eq: ["$status", "verified"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    DocumentSubmission.aggregate([
      { $match: { ...base, status: { $in: ["verified", "rejected"] }, verifiedAt: { $ne: null } } },
      { $project: { turnaroundMs: { $subtract: ["$verifiedAt", "$createdAt"] } } },
      { $group: { _id: null, avgMs: { $avg: "$turnaroundMs" }, reviewed: { $sum: 1 } } },
    ]),

    Applicant.aggregate([{ $match: base }, { $group: { _id: "$status", count: { $sum: 1 } } }]),

    College.find(base.collegeId ? { collegeId: base.collegeId } : {}).select("collegeId name").lean(),
  ]);

  const collegeNames = new Map(colleges.map((college) => [college.collegeId, college.name]));
  const documentStatus = Object.fromEntries(byStatus.map((item) => [item._id, item.count]));
  const applicantStatus = Object.fromEntries(applicantsByStatus.map((item) => [item._id, item.count]));

  res.json({
    documents: {
      pending: documentStatus.pending || 0,
      verified: documentStatus.verified || 0,
      rejected: documentStatus.rejected || 0,
    },
    applicants: {
      submitted: applicantStatus.submitted || 0,
      under_review: applicantStatus.under_review || 0,
      verified: applicantStatus.verified || 0,
      rejected: applicantStatus.rejected || 0,
    },
    perCollege: perCollege.map((item) => ({
      collegeId: item._id,
      collegeName: collegeNames.get(item._id) || item._id,
      pending: item.pending,
      flagged: item.flagged,
    })),
    throughput: throughput.map((item) => ({ date: item._id, verified: item.verified, rejected: item.rejected })),
    avgTimeToVerifyHours: timing[0]?.avgMs ? Number((timing[0].avgMs / 36e5).toFixed(2)) : null,
    reviewedTotal: timing[0]?.reviewed || 0,
  });
}

// GET /api/admissions/batches
export async function listBatches(req, res) {
  const { page, limit, skip } = pagination(req, 10);
  const filter = scoped(req);

  const [batches, total] = await Promise.all([
    AdmissionBatch.find(filter).select("-rows").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AdmissionBatch.countDocuments(filter),
  ]);

  res.json({ batches, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

// GET /api/admissions/batches/:batchId
export async function getBatch(req, res) {
  const batch = await AdmissionBatch.findOne({ batchId: req.params.batchId }).lean();
  if (!batch || !assertCanTouch(req, batch)) return res.status(404).json({ error: "Batch not found" });
  res.json({ batch });
}

// ---------------------------------------------------------------------------
// Enrolment — turns a verified applicant into a login-capable student
// ---------------------------------------------------------------------------

// POST /api/admissions/applicants/:applicantId/enroll
export async function enrollApplicant(req, res) {
  const applicant = await Applicant.findOne({ applicantId: req.params.applicantId });
  if (!applicant || !assertCanTouch(req, applicant)) {
    return res.status(404).json({ error: "Applicant not found" });
  }
  if (applicant.studentUserId) {
    return res.status(409).json({ error: "Applicant is already enrolled", studentUserId: applicant.studentUserId });
  }

  // Re-derive rather than trusting the stored status: enrolment is the point
  // where a wrong status would actually admit someone.
  const documents = await DocumentSubmission.find({ applicantId: applicant.applicantId })
    .select("documentType status")
    .lean();
  const derived = deriveApplicantStatus(applicant.program, documents);
  if (derived.status !== "verified") {
    return res.status(400).json({
      error: `Applicant is not fully verified (${derived.verifiedCount}/${derived.requiredCount} required documents verified)`,
    });
  }

  const email = applicant.email || `${applicant.applicantId.toLowerCase()}@applicant.tnteu.ac.in`;
  const clash = await User.findOne({ $or: [{ userId: applicant.applicantId }, { email }] }).lean();
  if (clash) {
    return res.status(409).json({ error: "A user with this ID or email already exists" });
  }

  const tempPassword = req.body?.password || `Tnteu@${crypto.randomInt(100000, 999999)}`;
  const student = await User.create({
    userId: applicant.applicantId,
    role: "student",
    name: applicant.name,
    email,
    phone: applicant.phone || undefined,
    passwordHash: await bcrypt.hash(tempPassword, 12),
    collegeId: applicant.collegeId,
    institutionId: applicant.collegeId,
    enrollmentNumber: applicant.rollNumber || applicant.applicantId,
    batchYear: new Date().getFullYear(),
    dob: applicant.dob || null,
    isActive: true,
    totpEnabled: false,
  });

  applicant.studentUserId = student.userId;
  applicant.enrolledAt = new Date();
  await applicant.save();

  await audit(req, "admission_applicant_enrolled", {
    targetType: "Applicant",
    targetId: applicant.applicantId,
    collegeId: applicant.collegeId,
    metadata: { studentUserId: student.userId },
  });

  res.status(201).json({
    message: "Applicant enrolled — student account created",
    studentUserId: student.userId,
    // Shown once so the university can hand it over; never stored in clear.
    temporaryPassword: req.body?.password ? undefined : tempPassword,
  });
}

// ---------------------------------------------------------------------------
// Student self-service
// ---------------------------------------------------------------------------

// GET /api/admissions/my-application
export async function getMyApplication(req, res) {
  const applicant = await Applicant.findOne({
    $or: [{ studentUserId: req.user.userId }, { applicantId: req.user.userId }],
  }).lean();

  if (!applicant) return res.json({ applicant: null, checklist: [], documents: [] });

  const documents = await DocumentSubmission.find({ applicantId: applicant.applicantId })
    .select("documentType status rejectionReason verifiedAt createdAt")
    .lean();
  const derived = deriveApplicantStatus(applicant.program, documents);
  const college = await College.findOne({ collegeId: applicant.collegeId }).select("name").lean();

  res.json({
    applicant: {
      applicantId: applicant.applicantId,
      name: applicant.name,
      program: applicant.program,
      status: applicant.status,
      submittedAt: applicant.submittedAt,
      reviewedAt: applicant.reviewedAt,
      rejectionReason: applicant.rejectionReason,
      collegeName: college?.name || applicant.collegeId,
      enrolledAt: applicant.enrolledAt,
    },
    checklist: derived.checklist,
    verifiedCount: derived.verifiedCount,
    requiredCount: derived.requiredCount,
    documents,
  });
}

export { ScopeError };
