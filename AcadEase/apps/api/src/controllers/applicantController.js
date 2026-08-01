import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { Applicant, DocumentSubmission, College, AuditLog } from "../models/index.js";
import { signApplicantToken, signApplicantRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import {
  DOCUMENT_LABELS,
  computeFlags,
  deriveApplicantStatus,
  isKnownDocumentType,
  requiredDocumentsFor,
  namesMatch,
  sha256,
} from "../utils/admissionRules.js";
import { expectedFieldsFor, extractDocumentFields } from "../utils/documentExtract.js";
import { inspectUpload, SIZE_LIMITS, IMAGE_LIMITS } from "../utils/imageInspect.js";
import { checkDocumentAuthenticity, QR_FLAG_LABELS } from "../utils/qrAuthenticity.js";
import { encryptDocument } from "../utils/documentCrypto.js";
import { ELIGIBILITY_RULES, evaluateEligibility, qualifyingMinimumFor } from "../utils/eligibility.js";
import { checkClaimedType, verificationGuidanceFor } from "../utils/tnDocuments.js";
import { extractPdfText } from "../utils/pdfText.js";

// The type check works off the same text the pre-fill uses; a file we cannot
// read simply yields "unconfirmed" rather than blowing up the upload.
function safePdfText(buffer) {
  try {
    return extractPdfText(buffer) || "";
  } catch {
    return "";
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_ROOT = path.resolve(__dirname, "../../secure-storage/admission-docs");

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;

export const applicantDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SIZE_LIMITS.maxBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    const okExt = [".pdf", ".jpg", ".jpeg", ".png"].includes(ext);
    const okMime = ["application/pdf", "image/jpeg", "image/png"].includes(mime);
    if (okExt && okMime) return cb(null, true);
    cb(new Error("Upload a PDF, JPG or PNG scan of the certificate"));
  },
});

export function loadApplicantById(applicantId) {
  return Applicant.findOne({ applicantId });
}

async function audit(actorId, action, metadata, collegeId) {
  try {
    await AuditLog.create({
      actorId,
      actorRole: "applicant",
      action,
      collegeId: collegeId || null,
      targetType: "Applicant",
      targetId: actorId,
      metadata: metadata || {},
    });
  } catch {
    // best effort
  }
}

// Name and date of birth must agree across an applicant's own documents. This
// is a plain string comparison across records we already hold — it catches a
// borrowed or substituted certificate that every per-file check would pass.
async function crossDocumentFlags(applicant, documentType, extractedFields) {
  const flags = [];
  const details = {};
  if (!extractedFields.name && !extractedFields.dob) return { flags, details };

  const siblings = await DocumentSubmission.find({
    applicantId: applicant.applicantId,
    documentType: { $ne: documentType },
  })
    .select("documentType extractedFields")
    .lean();

  const conflicts = [];
  for (const sibling of siblings) {
    const other = sibling.extractedFields || {};
    if (extractedFields.name && other.name && !namesMatch(extractedFields.name, other.name)) {
      conflicts.push({ field: "name", against: sibling.documentType, here: extractedFields.name, there: other.name });
    }
    if (extractedFields.dob && other.dob && extractedFields.dob !== other.dob) {
      conflicts.push({ field: "dob", against: sibling.documentType, here: extractedFields.dob, there: other.dob });
    }
  }

  if (conflicts.length) {
    flags.push("cross_document_mismatch");
    details.cross_document_mismatch = { conflicts };
  }
  return { flags, details };
}

function publicApplicant(applicant) {
  return {
    applicantId: applicant.applicantId,
    name: applicant.name,
    email: applicant.email,
    phone: applicant.phone,
    program: applicant.program,
    dob: applicant.dob,
    category: applicant.category,
    collegeId: applicant.collegeId,
    stage: applicant.stage,
    status: applicant.status,
    tenthPercentage: applicant.tenthPercentage,
    twelfthPercentage: applicant.twelfthPercentage,
    ugPercentage: applicant.ugPercentage,
    bedPercentage: applicant.bedPercentage,
    studentUserId: applicant.studentUserId,
  };
}

function startSession(res, applicant) {
  res.cookie("applicantRefresh", signApplicantRefreshToken(applicant), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/applicant",
  });

  // Same double-submit CSRF pattern the staff login uses, so the applicant's
  // subsequent uploads carry a token the global guard can check.
  res.cookie("csrfToken", crypto.randomBytes(32).toString("hex"), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Public: which universities and programmes can be applied to
// ---------------------------------------------------------------------------

// GET /api/applicant/options
export async function getApplicationOptions(req, res) {
  const colleges = await College.find({ status: "active" })
    .select("collegeId name district bedSeats medSeats")
    .sort({ name: 1 })
    .lean();

  res.json({
    colleges,
    programs: Object.entries(ELIGIBILITY_RULES).map(([program, rule]) => ({
      program,
      label: rule.label,
      generalMinimum: rule.generalMinimum,
      reservedMinimum: rule.reservedMinimum,
      qualifyingLabel: rule.qualifyingLabel,
      requiredDocuments: requiredDocumentsFor(program).map((type) => ({
        type,
        label: DOCUMENT_LABELS[type],
      })),
    })),
    documentLabels: DOCUMENT_LABELS,
    limits: {
      maxBytes: SIZE_LIMITS.maxBytes,
      minImageWidth: IMAGE_LIMITS.minWidth,
      minImageHeight: IMAGE_LIMITS.minHeight,
      recommendedDpi: IMAGE_LIMITS.recommendedDpi,
    },
  });
}

// ---------------------------------------------------------------------------
// Registration and temporary login
// ---------------------------------------------------------------------------

// POST /api/applicant/register
export async function registerApplicant(req, res) {
  const { name, email, phone, password, program, collegeId, dob, gender, category } = req.body || {};

  if (!name || !email || !password || !program || !collegeId) {
    return res.status(400).json({ error: "name, email, password, program and collegeId are required" });
  }
  if (!ELIGIBILITY_RULES[program]) {
    return res.status(400).json({ error: 'program must be "BEd" or "MEd"' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Choose a password of at least 8 characters" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }

  const college = await College.findOne({ collegeId, status: "active" }).lean();
  if (!college) return res.status(400).json({ error: "Choose a valid university" });

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await Applicant.findOne({ email: normalizedEmail });

  // A university may already have imported this person in a bulk batch. Rather
  // than creating a second record, let them claim the existing one — otherwise
  // their documents would end up split across two applications.
  if (existing) {
    if (existing.passwordHash) {
      return res.status(409).json({ error: "An application already exists for this email. Sign in instead." });
    }
    existing.passwordHash = await bcrypt.hash(password, 12);
    existing.name = existing.name || name;
    existing.phone = existing.phone || phone || null;
    existing.dob = existing.dob || dob || null;
    existing.category = existing.category || category || null;
    existing.stage = existing.stage === "enrolled" ? existing.stage : "draft";
    await existing.save();

    await audit(existing.applicantId, "applicant_account_claimed", { email: normalizedEmail }, existing.collegeId);

    startSession(res, existing);
    return res.status(200).json({
      message: "We found an application your university had already started for you.",
      claimed: true,
      accessToken: signApplicantToken(existing),
      applicant: publicApplicant(existing),
    });
  }

  const applicantId = `APL_${new Date().getFullYear()}_${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const applicant = await Applicant.create({
    applicantId,
    collegeId,
    name: String(name).trim().slice(0, 120),
    program,
    email: normalizedEmail,
    phone: phone || null,
    dob: dob || null,
    gender: gender || null,
    category: category || null,
    passwordHash: await bcrypt.hash(password, 12),
    source: "self",
    stage: "draft",
    status: "submitted",
    submittedBy: applicantId,
  });

  await audit(applicantId, "applicant_registered", { collegeId, program }, collegeId);

  startSession(res, applicant);

  res.status(201).json({
    message: "Application started",
    accessToken: signApplicantToken(applicant),
    applicant: publicApplicant(applicant),
  });
}

// POST /api/applicant/login
export async function loginApplicant(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const applicant = await Applicant.findOne({ email: String(email).toLowerCase().trim() });
  const genericError = { error: "Incorrect email or password" };

  if (!applicant || !applicant.passwordHash) return res.status(401).json(genericError);

  if (applicant.lockedUntil && applicant.lockedUntil > new Date()) {
    const minutes = Math.ceil((applicant.lockedUntil - Date.now()) / 60000);
    return res.status(423).json({ error: `Too many failed attempts. Try again in ${minutes} minute(s).` });
  }

  if (applicant.studentUserId) {
    return res.status(403).json({
      error: "Your admission is complete — sign in on the main login page with your student ID.",
      studentUserId: applicant.studentUserId,
    });
  }

  const ok = await bcrypt.compare(password, applicant.passwordHash);
  if (!ok) {
    applicant.failedLoginAttempts = (applicant.failedLoginAttempts || 0) + 1;
    if (applicant.failedLoginAttempts >= LOCK_THRESHOLD) {
      applicant.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      applicant.failedLoginAttempts = 0;
    }
    await applicant.save();
    return res.status(401).json(genericError);
  }

  applicant.failedLoginAttempts = 0;
  applicant.lockedUntil = null;
  applicant.lastLogin = new Date();
  await applicant.save();

  startSession(res, applicant);

  res.json({ accessToken: signApplicantToken(applicant), applicant: publicApplicant(applicant) });
}

// POST /api/applicant/refresh
export async function refreshApplicantToken(req, res) {
  const token = req.cookies?.applicantRefresh;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
  if (payload.typ !== "applicant_refresh") return res.status(401).json({ error: "Invalid refresh token" });

  const applicant = await Applicant.findOne({ applicantId: payload.applicantId });
  if (!applicant || applicant.studentUserId) return res.status(401).json({ error: "Session is no longer valid" });

  res.json({ accessToken: signApplicantToken(applicant), applicant: publicApplicant(applicant) });
}

// POST /api/applicant/logout
export async function logoutApplicant(req, res) {
  res.clearCookie("applicantRefresh", { path: "/api/applicant" });
  res.clearCookie("csrfToken");
  res.json({ message: "Signed out" });
}

// ---------------------------------------------------------------------------
// The applicant's own application
// ---------------------------------------------------------------------------

async function buildApplicationView(applicant) {
  const documents = await DocumentSubmission.find({ applicantId: applicant.applicantId })
    .select("documentType status flags flagCount rejectionReason qrCheck qualityWarnings qualityMetrics typeCheck verificationGuidance originalName size mimeType createdAt verifiedAt extractedFields")
    .sort({ createdAt: 1 })
    .lean();

  const derived = deriveApplicantStatus(applicant.program, documents);
  const eligibility = evaluateEligibility(applicant);
  const college = await College.findOne({ collegeId: applicant.collegeId }).select("name").lean();

  const uploadedTypes = new Set(documents.map((doc) => doc.documentType));
  const missingRequired = requiredDocumentsFor(applicant.program).filter((type) => !uploadedTypes.has(type));

  return {
    applicant: { ...publicApplicant(applicant), collegeName: college?.name || applicant.collegeId },
    documents: documents.map((doc) => ({ ...doc, label: DOCUMENT_LABELS[doc.documentType] || doc.documentType })),
    checklist: derived.checklist,
    verifiedCount: derived.verifiedCount,
    requiredCount: derived.requiredCount,
    missingRequired,
    eligibility,
    canSubmit: missingRequired.length === 0 && eligibility.eligible && applicant.stage === "draft",
    qrFlagLabels: QR_FLAG_LABELS,
  };
}

// GET /api/applicant/me
export async function getMyApplication(req, res) {
  res.json(await buildApplicationView(req.applicant));
}

// PATCH /api/applicant/me
export async function updateMyApplication(req, res) {
  const applicant = req.applicant;
  if (applicant.stage !== "draft") {
    return res.status(409).json({ error: "Your application has been submitted and can no longer be edited" });
  }

  const { name, phone, dob, gender, category, program, tenthPercentage, twelfthPercentage, ugPercentage, bedPercentage } =
    req.body || {};

  if (name) applicant.name = String(name).trim().slice(0, 120);
  if (phone !== undefined) applicant.phone = phone || null;
  if (dob !== undefined) applicant.dob = dob || null;
  if (gender !== undefined) applicant.gender = gender || null;
  if (category !== undefined) applicant.category = category || null;
  if (program && ELIGIBILITY_RULES[program]) applicant.program = program;

  for (const [field, value] of Object.entries({ tenthPercentage, twelfthPercentage, ugPercentage, bedPercentage })) {
    if (value === undefined) continue;
    if (value === null || value === "") {
      applicant[field] = null;
      continue;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 100) {
      return res.status(400).json({ error: `${field} must be a percentage between 0 and 100` });
    }
    applicant[field] = number;
  }

  const eligibility = evaluateEligibility(applicant);
  applicant.eligibility = {
    eligible: eligibility.eligible,
    evaluatedAt: new Date(),
    minimumRequired: eligibility.minimumRequired,
    blockers: eligibility.blockers,
  };
  await applicant.save();

  res.json(await buildApplicationView(applicant));
}

// GET /api/applicant/eligibility
export async function previewEligibility(req, res) {
  const merged = {
    program: req.query.program || req.applicant.program,
    category: req.query.category ?? req.applicant.category,
    tenthPercentage: req.query.tenthPercentage ?? req.applicant.tenthPercentage,
    twelfthPercentage: req.query.twelfthPercentage ?? req.applicant.twelfthPercentage,
    ugPercentage: req.query.ugPercentage ?? req.applicant.ugPercentage,
    bedPercentage: req.query.bedPercentage ?? req.applicant.bedPercentage,
  };
  res.json({ eligibility: evaluateEligibility(merged), minimumRequired: qualifyingMinimumFor(merged.program, merged.category) });
}

// ---------------------------------------------------------------------------
// Document upload — every check runs before the file is stored
// ---------------------------------------------------------------------------

// POST /api/applicant/documents
export async function uploadMyDocument(req, res) {
  const applicant = req.applicant;
  if (applicant.stage !== "draft") {
    return res.status(409).json({ error: "Your application has been submitted — contact your university to change a document" });
  }
  if (!req.file) return res.status(400).json({ error: "No file received" });

  const documentType = String(req.body.documentType || "").trim();
  if (!isKnownDocumentType(documentType)) {
    return res.status(400).json({ error: "Choose which document this is" });
  }

  const buffer = req.file.buffer;
  const mimeType = (req.file.mimetype || "").toLowerCase();

  // ── 1. Legibility. Refused up front so the applicant rescans now, not in
  //       three weeks when a reviewer finally opens it.
  const quality = inspectUpload(buffer, mimeType);
  if (!quality.ok) {
    return res.status(422).json({
      error: "This scan cannot be accepted",
      stage: "quality",
      problems: quality.hardFailures,
      metrics: quality.metrics,
    });
  }

  // ── 2. Authenticity, as far as it can honestly be established.
  const authenticity = await checkDocumentAuthenticity({ buffer, mimeType, applicant, documentType });
  if (authenticity.fatal) {
    await audit(
      applicant.applicantId,
      "applicant_document_refused",
      { documentType, reason: authenticity.status, headline: authenticity.headline },
      applicant.collegeId
    );
    return res.status(422).json({
      error: authenticity.headline,
      stage: "authenticity",
      problems: [authenticity.detail],
      qrCheck: { status: authenticity.status, headline: authenticity.headline, detail: authenticity.detail },
    });
  }

  // ── 3. A PDF with no text layer and no embedded image is a blank page —
  //       usually an export that went wrong. Nobody can review that.
  const { extractedFields, extractionSource } = await extractDocumentFields(buffer, mimeType, documentType);
  if (mimeType === "application/pdf" && extractionSource !== "pdf_text" && !authenticity.imagesScanned) {
    return res.status(422).json({
      error: "This PDF appears to be blank",
      stage: "quality",
      problems: [
        "The file contains no readable text and no scanned image. Open it to check it exported correctly, then upload it again.",
      ],
    });
  }

  // ── 4. Is this actually the document it was filed as? For a TN marksheet
  //       there is no QR to lean on, so this keyword check is the only thing
  //       standing between the queue and somebody attaching their degree
  //       certificate to the 10th-marksheet slot. Only refused when the file
  //       positively reads as a *different* known type — an unrecognisable
  //       scan is flagged for a human, never rejected.
  const documentText = mimeType === "application/pdf" ? safePdfText(buffer) : "";
  const typeCheck = checkClaimedType(documentType, documentText, { extractionSource });

  if (typeCheck.verdict === "mismatch") {
    await audit(
      applicant.applicantId,
      "applicant_document_refused",
      { documentType, reason: "wrong_document_type", detectedType: typeCheck.detectedType },
      applicant.collegeId
    );
    return res.status(422).json({
      error: `This does not look like your ${DOCUMENT_LABELS[documentType]}`,
      stage: "document_type",
      problems: [
        typeCheck.detail,
        "Check you picked the right file, then upload it under the correct heading.",
      ],
      detectedType: typeCheck.detectedType,
      suggestedType: typeCheck.detectedType,
    });
  }

  // ── 5. Duplicate detection across the entire system, on the plaintext hash.
  const fileHash = sha256(buffer);
  const hashMatches = await DocumentSubmission.find({ fileHash })
    .select("applicantId collegeId documentType createdAt")
    .lean();
  const foreignMatch = hashMatches.find((match) => match.applicantId !== applicant.applicantId);
  if (foreignMatch) {
    await audit(
      applicant.applicantId,
      "applicant_document_refused",
      { documentType, reason: "duplicate_hash", conflictsWith: foreignMatch.applicantId },
      applicant.collegeId
    );
    return res.status(422).json({
      error: "This exact file has already been submitted by another applicant",
      stage: "duplicate",
      problems: [
        "Byte for byte, this is the same file another person has already uploaded for their admission. If this is your own certificate, upload your original scan rather than a copy you were sent.",
      ],
    });
  }

  // ── 6. The standing rule-based flags, over the assistive pre-fill.
  const { flags, flagDetails } = computeFlags({
    applicant,
    extractedFields,
    extractionSource,
    hashMatches,
    expectedFields: expectedFieldsFor(documentType),
  });

  // An unconfirmed type is a flag, not a refusal — it puts the document in
  // front of a human sooner without punishing a genuine scanned certificate.
  const typeFlags = typeCheck.verdict === "unconfirmed" ? ["type_unconfirmed"] : [];
  const crossDocFlags = await crossDocumentFlags(applicant, documentType, extractedFields);

  const allFlags = [...new Set([...flags, ...(authenticity.flags || []), ...typeFlags, ...crossDocFlags.flags])];
  const flagDetailsWithQr = { ...flagDetails, ...crossDocFlags.details };
  if (typeFlags.length) flagDetailsWithQr.type_unconfirmed = { detail: typeCheck.detail, detectedType: typeCheck.detectedType };
  if (authenticity.flags?.length) {
    authenticity.flags.forEach((flag) => {
      flagDetailsWithQr[flag] = { status: authenticity.status, detail: authenticity.detail, link: authenticity.link };
    });
  }

  // ── 7. Encrypt, then write. Plaintext never reaches the disk.
  const { ciphertext, encryption } = encryptDocument(buffer, { collegeId: applicant.collegeId });

  const storedName = `${crypto.randomUUID()}.enc`;
  const collegeDir = path.join(SECURE_ROOT, applicant.collegeId.replace(/[^A-Za-z0-9_-]/g, "_"));
  if (!fs.existsSync(collegeDir)) fs.mkdirSync(collegeDir, { recursive: true });
  await fs.promises.writeFile(path.join(collegeDir, storedName), ciphertext);

  const payload = {
    applicantId: applicant.applicantId,
    collegeId: applicant.collegeId,
    documentType,
    storedName,
    filePath: path.posix.join(applicant.collegeId.replace(/[^A-Za-z0-9_-]/g, "_"), storedName),
    originalName: path.basename(req.file.originalname || storedName).slice(0, 160),
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
    // Where the QR check cannot help, this is what replaces it.
    verificationGuidance: verificationGuidanceFor(documentType, extractedFields),
    qualityMetrics: quality.metrics,
    qualityWarnings: quality.warnings,
    flags: allFlags,
    flagDetails: flagDetailsWithQr,
    flagCount: allFlags.length,
    // Held back from TNTEU's queue until the applicant actually submits.
    queued: applicant.stage !== "draft",
    status: "pending",
    verifiedBy: null,
    verifiedAt: null,
    rejectionReason: null,
    uploadedBy: applicant.applicantId,
    uploadedByRole: "applicant",
    batchId: null,
  };

  const previous = await DocumentSubmission.findOneAndUpdate(
    { applicantId: applicant.applicantId, documentType },
    { $set: payload },
    { upsert: true, new: false }
  );
  if (previous?.filePath && previous.storedName !== storedName) {
    fs.promises.unlink(path.join(SECURE_ROOT, previous.filePath)).catch(() => {});
  }

  await audit(
    applicant.applicantId,
    "applicant_document_uploaded",
    { documentType, qrStatus: authenticity.status, flags: allFlags, replaced: Boolean(previous) },
    applicant.collegeId
  );

  res.status(201).json({
    message: previous ? "Document replaced" : "Document accepted",
    documentType,
    label: DOCUMENT_LABELS[documentType],
    qrCheck: {
      status: authenticity.status,
      headline: authenticity.headline,
      detail: authenticity.detail,
      link: authenticity.link || null,
      issuerHost: authenticity.issuerHost || null,
    },
    quality: { metrics: quality.metrics, warnings: quality.warnings },
    typeCheck,
    verificationGuidance: verificationGuidanceFor(documentType, extractedFields),
    extractedFields,
    extractionSource,
    flags: allFlags,
    encryption: {
      algorithm: encryption.algorithm,
      readableBy: ["TNTEU (super admin)", `Your university (${applicant.collegeId})`],
    },
    application: await buildApplicationView(applicant),
  });
}

// DELETE /api/applicant/documents/:documentType
export async function deleteMyDocument(req, res) {
  const applicant = req.applicant;
  if (applicant.stage !== "draft") {
    return res.status(409).json({ error: "Your application has been submitted and can no longer be edited" });
  }

  const doc = await DocumentSubmission.findOneAndDelete({
    applicantId: applicant.applicantId,
    documentType: req.params.documentType,
  });
  if (!doc) return res.status(404).json({ error: "No such document" });

  fs.promises.unlink(path.join(SECURE_ROOT, doc.filePath)).catch(() => {});
  await audit(applicant.applicantId, "applicant_document_removed", { documentType: doc.documentType }, applicant.collegeId);

  res.json({ message: "Document removed", application: await buildApplicationView(applicant) });
}

// POST /api/applicant/submit
export async function submitMyApplication(req, res) {
  const applicant = req.applicant;
  if (applicant.stage !== "draft") {
    return res.status(409).json({ error: "This application has already been submitted" });
  }

  const documents = await DocumentSubmission.find({ applicantId: applicant.applicantId })
    .select("documentType")
    .lean();
  const uploaded = new Set(documents.map((doc) => doc.documentType));
  const missing = requiredDocumentsFor(applicant.program).filter((type) => !uploaded.has(type));

  if (missing.length) {
    return res.status(400).json({
      error: "Some required documents are still missing",
      missing: missing.map((type) => DOCUMENT_LABELS[type] || type),
    });
  }

  // The eligibility gate. Documents alone are not enough — the declared marks
  // have to clear the published minimum for the programme.
  const eligibility = evaluateEligibility(applicant);
  if (!eligibility.eligible) {
    return res.status(400).json({
      error: `You are not currently eligible for ${eligibility.programLabel}`,
      blockers: eligibility.blockers,
      missing: eligibility.missing,
      eligibility,
    });
  }

  // Releasing the documents into TNTEU's queue is the actual act of submitting.
  await DocumentSubmission.updateMany({ applicantId: applicant.applicantId }, { $set: { queued: true } });

  applicant.stage = "submitted";
  applicant.status = "submitted";
  applicant.submittedAt = new Date();
  applicant.eligibility = {
    eligible: true,
    evaluatedAt: new Date(),
    minimumRequired: eligibility.minimumRequired,
    blockers: [],
  };
  await applicant.save();

  await audit(
    applicant.applicantId,
    "applicant_application_submitted",
    { program: applicant.program, documentCount: documents.length },
    applicant.collegeId
  );

  res.json({
    message: "Application submitted to TNTEU for verification",
    application: await buildApplicationView(applicant),
  });
}
