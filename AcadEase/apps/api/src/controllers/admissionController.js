import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
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
import { encryptDocument, decryptDocument, describeAccess, DecryptionDeniedError } from "../utils/documentCrypto.js";
import { checkDocumentAuthenticity, QR_FLAG_LABELS } from "../utils/qrAuthenticity.js";
import { inspectUpload } from "../utils/imageInspect.js";
import { evaluateEligibility } from "../utils/eligibility.js";
import { checkClaimedType, verificationGuidanceFor } from "../utils/tnDocuments.js";
import { extractPdfText } from "../utils/pdfText.js";
import { pushNotification } from "../utils/notify.js";
import {
  assessDocument,
  severityCountPipeline,
  verifyStoredIntegrity,
  stageForRole,
  nextStageAfter,
  GATE_FLAG_LABELS,
  STAGE_LABELS,
} from "../utils/reviewGate.js";
import { signApproval, lastSignature, verifyChain, keyIdForActor } from "../utils/approvalChain.js";

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
  // Marks drive the eligibility gate, so a university submitting on an
  // applicant's behalf has to supply them too.
  tenthpercentage: "tenthPercentage",
  tenth: "tenthPercentage",
  twelfthpercentage: "twelfthPercentage",
  twelfth: "twelfthPercentage",
  ugpercentage: "ugPercentage",
  ug: "ugPercentage",
  bedpercentage: "bedPercentage",
  bed: "bedPercentage",
};

const MARK_FIELDS = ["tenthPercentage", "twelfthPercentage", "ugPercentage", "bedPercentage"];

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

  for (const field of MARK_FIELDS) {
    if (!row[field]) continue;
    const value = Number(row[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.push(`${field} must be a percentage between 0 and 100`);
    }
  }

  return errors;
}

function marksFrom(row) {
  return Object.fromEntries(
    MARK_FIELDS.map((field) => [field, row[field] ? Number(row[field]) : null])
  );
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
    const marks = marksFrom(row);
    const eligibility = evaluateEligibility({ ...row, ...marks });

    toInsert.push({
      applicantId: row.applicantId,
      collegeId,
      batchId,
      ...marks,
      eligibility: {
        eligible: eligibility.eligible,
        evaluatedAt: new Date(),
        minimumRequired: eligibility.minimumRequired,
        blockers: eligibility.blockers,
      },
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
      // Surfaced in the import report so the university sees, at import time,
      // which of their applicants will not clear the eligibility gate later.
      eligible: eligibility.eligible,
      eligibilityBlockers: [...eligibility.blockers, ...(eligibility.missing.length ? ["marks not supplied"] : [])],
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
  const mimeType = (file.mimetype || "").toLowerCase();
  const fileHash = sha256(buffer);

  // Bulk-uploaded documents go through the same instant checks an applicant's
  // own upload does, so a batch cannot be used to bypass them.
  const quality = inspectUpload(buffer, mimeType);
  if (!quality.ok) {
    throw new Error(quality.hardFailures[0]);
  }

  const authenticity = await checkDocumentAuthenticity({ buffer, mimeType, applicant, documentType });
  if (authenticity.fatal) {
    throw new Error(authenticity.headline);
  }

  // Same document-identity check the applicant portal runs. In a bulk upload
  // this is the check that catches a mis-named file in a folder of forty.
  let documentText = "";
  if (mimeType === "application/pdf") {
    try { documentText = extractPdfText(buffer) || ""; } catch { documentText = ""; }
  }

  const hashMatches = await DocumentSubmission.find({ fileHash })
    .select("applicantId collegeId documentType createdAt")
    .lean();

  const { extractedFields, extractionSource } = await extractDocumentFields(buffer, mimeType, documentType);

  const typeCheck = checkClaimedType(documentType, documentText, { extractionSource });
  if (typeCheck.verdict === "mismatch") {
    throw new Error(typeCheck.detail);
  }

  const { flags: ruleFlags, flagDetails } = computeFlags({
    applicant,
    extractedFields,
    extractionSource,
    hashMatches,
    expectedFields: expectedFieldsFor(documentType),
  });

  const flags = [...new Set([
    ...ruleFlags,
    ...(authenticity.flags || []),
    ...(typeCheck.verdict === "unconfirmed" ? ["type_unconfirmed"] : []),
  ])];
  if (typeCheck.verdict === "unconfirmed") {
    flagDetails.type_unconfirmed = { detail: typeCheck.detail, detectedType: typeCheck.detectedType };
  }
  (authenticity.flags || []).forEach((flag) => {
    flagDetails[flag] = { status: authenticity.status, detail: authenticity.detail, link: authenticity.link };
  });

  // Encrypted at rest, wrapped for TNTEU and the owning university only.
  const { ciphertext, encryption } = encryptDocument(buffer, { collegeId: applicant.collegeId });

  // Never reuse the client-supplied filename; it is kept only as a label.
  const storedName = `${crypto.randomUUID()}.enc`;
  const collegeDir = path.join(SECURE_ROOT, applicant.collegeId.replace(/[^A-Za-z0-9_-]/g, "_"));
  if (!fs.existsSync(collegeDir)) fs.mkdirSync(collegeDir, { recursive: true });
  const absolutePath = path.join(collegeDir, storedName);
  await fs.promises.writeFile(absolutePath, ciphertext);

  const payload = {
    applicantId: applicant.applicantId,
    collegeId: applicant.collegeId,
    documentType,
    storedName,
    filePath: path.relative(SECURE_ROOT, absolutePath).split(path.sep).join("/"),
    originalName: path.basename(file.originalname || storedName).slice(0, 160),
    mimeType,
    size: buffer.length,
    fileHash,
    encryption,
    extractedFields,
    extractionSource,
    fieldsConfirmedBy: null,
    qrCheck: {
      status: authenticity.status,
      headline: authenticity.headline,
      detail: authenticity.detail,
      link: authenticity.link || null,
      issuerHost: authenticity.issuerHost || null,
      certId: authenticity.certId || null,
      payloads: authenticity.payloads || [],
      checkedAt: new Date(),
    },
    typeCheck: { verdict: typeCheck.verdict, detectedType: typeCheck.detectedType, detail: typeCheck.detail },
    verificationGuidance: verificationGuidanceFor(documentType, extractedFields),
    qualityMetrics: quality.metrics,
    qualityWarnings: quality.warnings,
    flags,
    flagDetails,
    flagCount: flags.length,
    // A replacement file starts the two-stage chain over from the beginning.
    // Carrying a previous university approval across to a different file would
    // mean TNTEU counter-signing something nobody approved.
    reviewStage: "college",
    collegeReview: { decision: "pending", by: null, byName: null, at: null, reason: null, mode: null },
    tnteuReview: { decision: "pending", by: null, byName: null, at: null, reason: null, mode: null },
    approvals: [],
    integrityCheckedAt: null,
    integrityOk: null,
    status: "pending",
    verifiedBy: null,
    verifiedAt: null,
    rejectionReason: null,
    uploadedBy: req.user.userId,
    uploadedByRole: req.user.role,
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

  const documents = await DocumentSubmission.find({ applicantId })
    .select("documentType status reviewStage flags _id")
    .lean();
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
// The two-stage verification queue
//
// A document is approved twice, by two institutions, in a fixed order:
//
//   applicant submits
//        ↓  reviewStage = "college"
//   the submitting university approves (bulk for clean ones, individually for
//   anything flagged) or rejects
//        ↓  reviewStage = "tnteu"
//   TNTEU gives final approval (bulk / individual) or rejects
//        ↓  reviewStage = "complete", status = verified | rejected
//
// The stage is stored on the document, so neither party can act out of turn
// and TNTEU can never be handed something the university has not stood behind.
// Each decision is counter-signed with the deciding institution's private key.
// ---------------------------------------------------------------------------

// Documents written before the two-stage chain existed carry no reviewStage.
// They belong at the head of the chain, not nowhere.
function stageFilter(stage) {
  if (stage !== "college") return { reviewStage: stage };
  return { $or: [{ reviewStage: "college" }, { reviewStage: { $exists: false } }, { reviewStage: null }] };
}

function currentStage(doc) {
  return doc.reviewStage || "college";
}

function requireReviewStage(req) {
  const stage = stageForRole(req.user?.role);
  if (!stage) throw new ScopeError("Your role does not take part in document verification");
  return stage;
}

// GET /api/admissions/queue
export async function getVerificationQueue(req, res) {
  const { page, limit, skip } = pagination(req);
  const stage = requireReviewStage(req);

  // `queued` keeps drafts out: an applicant still uploading is not review work.
  const filter = scoped(req, {
    status: req.query.status || "pending",
    queued: true,
    ...stageFilter(stage),
  });

  if (req.query.documentType) filter.documentType = String(req.query.documentType);
  if (req.query.flagged === "true") filter.flagCount = { $gt: 0 };
  if (req.query.flagged === "false") filter.flagCount = 0;

  // Flagged documents first, then oldest waiting — this is the order a
  // reviewer should work in, and it comes straight off the index.
  const [documents, total, severityCounts] = await Promise.all([
    DocumentSubmission.find(filter).sort({ flagCount: -1, createdAt: 1 }).skip(skip).limit(limit).lean(),
    DocumentSubmission.countDocuments(filter),
    // Counted across the whole stage, not just this page, so the reviewer knows
    // how much of the backlog is sweepable before they start. Aggregated in the
    // database — the backlog is never loaded to be counted.
    DocumentSubmission.aggregate([{ $match: filter }, ...severityCountPipeline()]),
  ]);

  const summary = { clean: 0, attention: 0, suspect: 0 };
  severityCounts.forEach((item) => {
    summary[item._id] = item.count;
  });

  const applicantIds = [...new Set(documents.map((doc) => doc.applicantId))];
  const collegeIds = [...new Set(documents.map((doc) => doc.collegeId))];
  const [applicants, colleges] = await Promise.all([
    Applicant.find({ applicantId: { $in: applicantIds } }).select("applicantId name program status").lean(),
    College.find({ collegeId: { $in: collegeIds } }).select("collegeId name").lean(),
  ]);
  const applicantById = new Map(applicants.map((item) => [item.applicantId, item]));
  const collegeById = new Map(colleges.map((item) => [item.collegeId, item.name]));

  res.json({
    stage,
    stageLabel: STAGE_LABELS[stage],
    documents: documents.map((doc) => {
      const assessment = assessDocument(doc);
      return {
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
        reviewStage: currentStage(doc),
        // What the university already decided, shown on TNTEU's queue so the
        // final approver can see whose word they are counter-signing.
        collegeReview: stage === "tnteu" ? doc.collegeReview : undefined,
        severity: assessment.severity,
        bulkEligible: assessment.bulkEligible,
        blockers: assessment.blockers,
        submittedAt: doc.createdAt,
        waitingHours: Math.round((Date.now() - new Date(doc.createdAt).getTime()) / 36e5),
      };
    }),
    summary,
    flagLabels: GATE_FLAG_LABELS,
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

  const stage = stageForRole(req.user.role);
  const assessment = assessDocument(doc);

  res.json({
    document: {
      ...doc,
      reviewStage: currentStage(doc),
      label: DOCUMENT_LABELS[doc.documentType] || doc.documentType,
      expectedFields: expectedFieldsFor(doc.documentType),
      // The wrapped-key list, in words — who can actually open this file.
      readableBy: describeAccess(doc.encryption),
    },
    // Whose desk it is on, and whether this viewer is the one holding it.
    stage: currentStage(doc),
    stageLabel: STAGE_LABELS[currentStage(doc)],
    viewerStage: stage,
    canDecide: doc.status === "pending" && doc.queued && currentStage(doc) === stage,
    assessment,
    // Re-verified on every read, so a decision that was edited in the database
    // shows up as broken here rather than being taken on trust.
    approvalChain: verifyChain(doc.approvals || [], "DocumentSubmission", String(doc._id)),
    applicant,
    collegeName: college?.name || doc.collegeId,
    checklist: derived.checklist,
    verifiedCount: derived.verifiedCount,
    requiredCount: derived.requiredCount,
    duplicateOf,
    eligibility: applicant ? evaluateEligibility(applicant) : null,
    flagLabels: { ...FLAG_LABELS, ...QR_FLAG_LABELS, ...GATE_FLAG_LABELS },
  });
}

// GET /api/admissions/documents/:id/file
export async function streamDocumentFile(req, res) {
  const doc = await DocumentSubmission.findById(req.params.id)
    .select("filePath mimeType collegeId originalName encryption")
    .lean();
  if (!doc || !assertCanTouch(req, doc)) return res.status(404).json({ error: "Document not found" });

  // filePath is server-generated, but resolve-and-check anyway so a tampered
  // record can never read outside the document root.
  const absolute = path.resolve(SECURE_ROOT, doc.filePath);
  if (!absolute.startsWith(SECURE_ROOT + path.sep) || !fs.existsSync(absolute)) {
    return res.status(404).json({ error: "Stored file is missing" });
  }

  const stored = await fs.promises.readFile(absolute);

  // What is on disk is ciphertext. Decryption needs a data key wrapped for the
  // caller's own institution — a role with no wrapped key gets nothing, and
  // AES-GCM's auth tag means a tampered file throws rather than rendering.
  let plaintext;
  try {
    plaintext = doc.encryption?.wrappedKeys
      ? decryptDocument(stored, doc.encryption, { role: req.user.role, collegeId: ownCollegeId(req) })
      : stored; // pre-encryption records from an earlier build
  } catch (err) {
    if (err instanceof DecryptionDeniedError) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(422).json({
      error: "This document failed its integrity check and may have been altered on disk",
    });
  }

  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename="document${path.extname(doc.originalName || "")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(plaintext);
}

// ---------------------------------------------------------------------------
// One decision, applied identically whether it came from a single review screen
// or from a bulk sweep of two hundred documents.
//
// `mode: "bulk"` is the only difference, and it only ever *removes* permission:
// a bulk sweep may not touch anything the gate has not classified as clean.
// Every other check — stage, scope, integrity, late duplicates — runs the same
// in both modes, so there is no path that approves a document with fewer checks
// than the careful path applies.
// ---------------------------------------------------------------------------

const REJECTION_MIN_LENGTH = 5;

function skip(doc, reasons) {
  return {
    outcome: "skipped",
    documentId: String(doc._id),
    applicantId: doc.applicantId,
    collegeId: doc.collegeId,
    documentType: doc.documentType,
    label: DOCUMENT_LABELS[doc.documentType] || doc.documentType,
    reasons: Array.isArray(reasons) ? reasons : [reasons],
  };
}

async function raiseFlag(doc, flag, detail) {
  if (!doc.flags.includes(flag)) {
    doc.flags.push(flag);
    doc.flagCount = doc.flags.length;
  }
  doc.flagDetails = { ...(doc.flagDetails || {}), [flag]: detail };
  doc.markModified("flagDetails");
  await doc.save();
}

async function applyDecision({ req, doc, stage, decision, reason, mode, confirmedFields }) {
  if (!assertCanTouch(req, doc)) return skip(doc, "This document belongs to another university");
  if (!doc.queued) return skip(doc, "The applicant has not submitted this application yet");
  if (doc.status !== "pending") return skip(doc, `Already ${doc.status}`);

  const at = currentStage(doc);
  if (at !== stage) {
    return skip(doc, at === "tnteu"
      ? "Already approved by the university — it is with TNTEU now"
      : `This document is at the ${STAGE_LABELS[at]} stage`);
  }

  if (decision === "approve") {
    const assessment = assessDocument(doc);

    // The bulk gate. A flagged document is never swept through — the reviewer
    // has to open it, look at the file, and decide with their name on it.
    if (mode === "bulk" && !assessment.bulkEligible) {
      return skip(doc, assessment.blockers.map((item) => item.label));
    }

    // Re-hash the file on disk right now. Everything else judged this document
    // as it was at upload; this is the only check that judges it as it is at
    // the moment somebody puts their signature on it.
    const integrity = await verifyStoredIntegrity(doc, {
      role: req.user.role,
      collegeId: ownCollegeId(req),
      secureRoot: SECURE_ROOT,
    });
    doc.integrityCheckedAt = new Date();
    doc.integrityOk = integrity.ok;
    if (!integrity.ok) {
      await raiseFlag(doc, "integrity_failed", { detail: integrity.reason, checkedAt: new Date() });
      return skip(doc, [integrity.reason, "Approval refused — this file cannot be confirmed to be the one that was uploaded."]);
    }

    // A duplicate can appear *after* upload: applicant B submits the same file
    // an hour after applicant A. A's document was clean when it arrived and
    // would otherwise be swept through untouched.
    const alreadyKnown = doc.flags.includes("duplicate_hash");
    const twin = await DocumentSubmission.findOne({
      fileHash: doc.fileHash,
      applicantId: { $ne: doc.applicantId },
      _id: { $ne: doc._id },
    })
      .select("applicantId collegeId documentType createdAt")
      .lean();
    if (twin) {
      await raiseFlag(doc, "duplicate_hash", {
        applicantId: twin.applicantId,
        collegeId: twin.collegeId,
        documentType: twin.documentType,
        submittedAt: twin.createdAt,
      });
      // In bulk, always refused. In individual review it is refused only the
      // first time — once the flag is on the record the reviewer sees both
      // copies side by side on the review screen and can say which is genuine.
      // Refusing forever would leave the honest applicant's certificate
      // unapprovable because somebody else copied it.
      if (mode === "bulk" || !alreadyKnown) {
        return skip(doc, [
          `The identical file was also submitted by ${twin.applicantId}`,
          alreadyKnown
            ? "Open both and approve the genuine one individually."
            : "Reload this document — the duplicate was found after you opened it — then decide which copy is genuine.",
        ]);
      }
    }
  }

  // A reviewer's confirmed/corrected fields replace the assistive pre-fill.
  if (confirmedFields && typeof confirmedFields === "object" && !Array.isArray(confirmedFields)) {
    const clean = {};
    Object.entries(confirmedFields)
      .slice(0, 30)
      .forEach(([key, value]) => {
        if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) clean[key] = String(value ?? "").slice(0, 200);
      });
    doc.extractedFields = clean;
    doc.fieldsConfirmedBy = req.user.userId;
  }

  const remarks = String(reason || "").slice(0, 500);
  const record = {
    decision: decision === "approve" ? "approved" : "rejected",
    by: req.user.userId,
    byName: req.user.name || null,
    at: new Date(),
    reason: remarks || null,
    mode,
  };

  // Counter-sign with the deciding institution's own private key. Only the key
  // holder can produce this; anyone at all can check it.
  const keyId = keyIdForActor({ role: req.user.role, collegeId: ownCollegeId(req) });
  if (!keyId) return skip(doc, "Your account is not linked to an institutional signing key");

  doc.approvals.push(
    signApproval({
      subjectType: "DocumentSubmission",
      subjectId: String(doc._id),
      stage: stage === "college" ? "university_review" : "tnteu_review",
      decision: record.decision,
      actorId: req.user.userId,
      actorName: req.user.name || null,
      actorRole: req.user.role,
      keyId,
      remarks,
      decidedAt: record.at,
      previousSignature: lastSignature(doc.approvals),
    })
  );
  doc.markModified("approvals");

  if (stage === "college") doc.collegeReview = record;
  else doc.tnteuReview = record;

  if (decision === "reject") {
    doc.reviewStage = "complete";
    doc.status = "rejected";
    doc.rejectionReason = `${STAGE_LABELS[stage]}: ${remarks}`;
    doc.verifiedBy = req.user.userId;
    doc.verifiedAt = record.at;
  } else if (stage === "college") {
    // A university approval forwards the document. It does NOT verify it —
    // only TNTEU's counter-signature can do that.
    doc.reviewStage = "tnteu";
    doc.status = "pending";
  } else {
    doc.reviewStage = "complete";
    doc.status = "verified";
    doc.verifiedBy = req.user.userId;
    doc.verifiedAt = record.at;
    doc.rejectionReason = null;
  }

  await doc.save();

  return {
    outcome: decision === "approve" ? (stage === "college" ? "forwarded" : "verified") : "rejected",
    documentId: String(doc._id),
    applicantId: doc.applicantId,
    collegeId: doc.collegeId,
    documentType: doc.documentType,
    label: DOCUMENT_LABELS[doc.documentType] || doc.documentType,
    reasons: [],
  };
}

// Notifications and applicant-status refresh, run once per batch rather than
// once per document.
async function settleAfterDecisions({ req, stage, results, decision }) {
  const succeeded = results.filter((item) => item.outcome !== "skipped");
  const applicantIds = [...new Set(succeeded.map((item) => item.applicantId))];

  const statuses = [];
  for (const applicantId of applicantIds) {
    const refreshed = await refreshApplicantStatus(applicantId, req.user.userId);
    if (refreshed) statuses.push(refreshed);
  }

  if (!succeeded.length) return statuses;

  if (decision === "approve" && stage === "college") {
    notifyTnteuAdmins({
      title: "Documents awaiting TNTEU approval",
      message: `${succeeded.length} document(s) approved by ${ownCollegeId(req)} and forwarded for final approval.`,
      linkTo: "/admin/verification",
    });
  }

  if (decision === "reject") {
    const rejectedBy = stage === "college" ? "your university" : "TNTEU";
    // One notification per affected university, not one per document.
    const byCollege = new Map();
    succeeded.forEach((item) => {
      if (!byCollege.has(item.collegeId)) byCollege.set(item.collegeId, []);
      byCollege.get(item.collegeId).push(item);
    });
    byCollege.forEach((items, collegeId) =>
      notifyCollegeAdmins(collegeId, {
        title: `Document${items.length > 1 ? "s" : ""} rejected by ${rejectedBy}`,
        message:
          items
            .slice(0, 5)
            .map((item) => `${item.label} — ${item.applicantId}`)
            .join("; ") + (items.length > 5 ? ` and ${items.length - 5} more` : ""),
        linkTo: "/admin/admissions/applicants",
      })
    );
  }

  statuses
    .filter((item) => item.changed && item.applicant.status === "verified")
    .forEach((item) =>
      notifyCollegeAdmins(item.applicant.collegeId, {
        title: "Applicant fully verified",
        message: `All required documents for ${item.applicant.name} (${item.applicant.applicantId}) are verified by TNTEU. You can now enrol them.`,
        linkTo: `/admin/admissions/applicants/${item.applicant.applicantId}`,
      })
    );

  return statuses;
}

// PATCH /api/admissions/documents/:id/verify
export async function verifyDocument(req, res) {
  const stage = requireReviewStage(req);
  const doc = await DocumentSubmission.findById(req.params.id);
  if (!doc || !assertCanTouch(req, doc)) return res.status(404).json({ error: "Document not found" });

  const result = await applyDecision({
    req,
    doc,
    stage,
    decision: "approve",
    mode: "individual",
    confirmedFields: req.body?.extractedFields,
  });

  if (result.outcome === "skipped") {
    return res.status(409).json({ error: result.reasons[0], reasons: result.reasons });
  }

  const statuses = await settleAfterDecisions({ req, stage, results: [result], decision: "approve" });
  const refreshed = statuses[0];

  await audit(req, stage === "college" ? "admission_document_college_approved" : "admission_document_verified", {
    targetType: "DocumentSubmission",
    targetId: doc._id,
    collegeId: doc.collegeId,
    metadata: {
      applicantId: doc.applicantId,
      documentType: doc.documentType,
      stage,
      mode: "individual",
      flagsAtReview: doc.flags,
      applicantStatus: refreshed?.applicant?.status,
    },
  });

  res.json({
    message: stage === "college" ? "Approved and forwarded to TNTEU" : "Document verified",
    outcome: result.outcome,
    reviewStage: doc.reviewStage,
    document: doc,
    applicantStatus: refreshed?.applicant?.status,
    verifiedCount: refreshed?.derived?.verifiedCount,
    requiredCount: refreshed?.derived?.requiredCount,
  });
}

// PATCH /api/admissions/documents/:id/reject
export async function rejectDocument(req, res) {
  const stage = requireReviewStage(req);
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < REJECTION_MIN_LENGTH) {
    return res.status(400).json({ error: "A rejection reason of at least 5 characters is required" });
  }

  const doc = await DocumentSubmission.findById(req.params.id);
  if (!doc || !assertCanTouch(req, doc)) return res.status(404).json({ error: "Document not found" });

  const result = await applyDecision({ req, doc, stage, decision: "reject", reason, mode: "individual" });
  if (result.outcome === "skipped") {
    return res.status(409).json({ error: result.reasons[0], reasons: result.reasons });
  }

  const statuses = await settleAfterDecisions({ req, stage, results: [result], decision: "reject" });

  await audit(req, "admission_document_rejected", {
    targetType: "DocumentSubmission",
    targetId: doc._id,
    collegeId: doc.collegeId,
    metadata: {
      applicantId: doc.applicantId,
      documentType: doc.documentType,
      stage,
      mode: "individual",
      reason: doc.rejectionReason,
      flagsAtReview: doc.flags,
    },
  });

  res.json({
    message: "Document rejected",
    document: doc,
    applicantStatus: statuses[0]?.applicant?.status,
  });
}

// ---------------------------------------------------------------------------
// Bulk approval / rejection
// ---------------------------------------------------------------------------

const MAX_BULK = 200;

// POST /api/admissions/queue/bulk
// body: { decision: "approve" | "reject", documentIds: [...], reason?, scope? }
//
// `scope: "all_eligible"` sweeps every clean document at the caller's stage
// without the client having to enumerate them. It is still the same gate: the
// server decides what is eligible, never the request.
export async function bulkDecide(req, res) {
  const stage = requireReviewStage(req);
  const decision = req.body?.decision === "reject" ? "reject" : "approve";
  const reason = String(req.body?.reason || "").trim();

  if (decision === "reject" && reason.length < REJECTION_MIN_LENGTH) {
    return res.status(400).json({ error: "A rejection reason of at least 5 characters is required" });
  }

  const base = scoped(req, { status: "pending", queued: true, ...stageFilter(stage) });

  let documents;
  if (req.body?.scope === "all_eligible") {
    if (decision === "reject") {
      return res.status(400).json({ error: "Rejections must name the documents being rejected" });
    }
    // Unflagged only — the gate re-checks each one anyway, this just avoids
    // loading the whole backlog to throw most of it away.
    documents = await DocumentSubmission.find({ ...base, flagCount: 0 }).limit(MAX_BULK);
  } else {
    const ids = Array.isArray(req.body?.documentIds) ? req.body.documentIds : [];
    if (!ids.length) return res.status(400).json({ error: "Select at least one document" });
    if (ids.length > MAX_BULK) {
      return res.status(400).json({ error: `Up to ${MAX_BULK} documents can be decided at once` });
    }
    const valid = ids.filter((id) => mongoose.isValidObjectId(id));
    documents = await DocumentSubmission.find({ _id: { $in: valid } });
  }

  const results = [];
  for (const doc of documents) {
    try {
      results.push(await applyDecision({ req, doc, stage, decision, reason, mode: "bulk" }));
    } catch (err) {
      results.push(skip(doc, err.message || "This document could not be decided"));
    }
  }

  const statuses = await settleAfterDecisions({ req, stage, results, decision });

  const decided = results.filter((item) => item.outcome !== "skipped");
  const skipped = results.filter((item) => item.outcome === "skipped");

  await audit(req, decision === "approve" ? "admission_bulk_approved" : "admission_bulk_rejected", {
    targetType: "DocumentSubmission",
    targetId: null,
    metadata: {
      stage,
      requested: documents.length,
      decided: decided.length,
      skipped: skipped.length,
      documentIds: decided.map((item) => item.documentId).slice(0, 200),
      reason: decision === "reject" ? reason : undefined,
    },
  });

  res.json({
    stage,
    decision,
    requested: documents.length,
    decidedCount: decided.length,
    skippedCount: skipped.length,
    decided,
    skipped,
    applicantsNowVerified: statuses
      .filter((item) => item.applicant.status === "verified")
      .map((item) => ({ applicantId: item.applicant.applicantId, name: item.applicant.name })),
    message:
      decision === "approve"
        ? `${decided.length} document(s) ${stage === "college" ? "approved and forwarded to TNTEU" : "verified"}` +
          (skipped.length ? `, ${skipped.length} held back for individual review.` : ".")
        : `${decided.length} document(s) rejected` + (skipped.length ? `, ${skipped.length} skipped.` : "."),
  });
}

function notifyTnteuAdmins(payload) {
  User.find({ role: "tnteu_admin" })
    .select("userId")
    .lean()
    .then((admins) =>
      Promise.all(admins.map((admin) => pushNotification({ userId: admin.userId, type: "admission", ...payload }).catch(() => {})))
    )
    .catch(() => {});
}

function notifyCollegeAdmins(collegeId, payload) {
  if (!collegeId) return;
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

  const [byStatus, byStage, perCollege, throughput, timing, applicantsByStatus, colleges] = await Promise.all([
    DocumentSubmission.aggregate([{ $match: { ...base, queued: true } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),

    // Where the pending backlog is sitting: with the universities, or with TNTEU.
    DocumentSubmission.aggregate([
      { $match: { ...base, status: "pending", queued: true } },
      { $group: { _id: { $ifNull: ["$reviewStage", "college"] }, count: { $sum: 1 } } },
    ]),

    DocumentSubmission.aggregate([
      { $match: { ...base, status: "pending", queued: true } },
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
  const stageCounts = Object.fromEntries(byStage.map((item) => [item._id, item.count]));

  res.json({
    documents: {
      pending: documentStatus.pending || 0,
      verified: documentStatus.verified || 0,
      rejected: documentStatus.rejected || 0,
      awaitingCollege: stageCounts.college || 0,
      awaitingTnteu: stageCounts.tnteu || 0,
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

  // Verified documents establish that the marks are real; eligibility decides
  // whether those marks qualify for the programme. Both gates must pass before
  // a student account exists.
  const eligibility = evaluateEligibility(applicant);
  if (!eligibility.eligible) {
    return res.status(400).json({
      error: `Applicant does not meet the ${eligibility.programLabel} eligibility criteria`,
      blockers: eligibility.blockers,
      missing: eligibility.missing,
      eligibility,
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
  // Retires the temporary applicant login — from here they sign in as a student.
  applicant.stage = "enrolled";
  applicant.passwordHash = null;
  applicant.refreshTokenHash = null;
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
    .select("documentType status reviewStage rejectionReason verifiedAt createdAt")
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
