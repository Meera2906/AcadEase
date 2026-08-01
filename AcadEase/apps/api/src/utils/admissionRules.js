import crypto from "crypto";

// ---------------------------------------------------------------------------
// Document taxonomy
// ---------------------------------------------------------------------------

export const DOCUMENT_LABELS = {
  "10th_marksheet": "10th Marksheet",
  "12th_marksheet": "12th Marksheet",
  ug_degree: "UG Degree Certificate",
  bed_degree: "B.Ed Degree Certificate",
  transfer_certificate: "Transfer Certificate",
  community_certificate: "Community Certificate",
  id_proof: "Government ID Proof",
};

export const DOCUMENT_TYPES = Object.keys(DOCUMENT_LABELS);

// The checklist a human reviewer works against. An applicant flips to
// `verified` only when every entry here is individually verified.
export const REQUIRED_DOCUMENTS = {
  BEd: ["10th_marksheet", "12th_marksheet", "ug_degree", "transfer_certificate", "id_proof"],
  MEd: ["10th_marksheet", "12th_marksheet", "ug_degree", "bed_degree", "id_proof"],
};

export function requiredDocumentsFor(program) {
  return REQUIRED_DOCUMENTS[program] || REQUIRED_DOCUMENTS.BEd;
}

export function isKnownDocumentType(type) {
  return DOCUMENT_TYPES.includes(type);
}

// ---------------------------------------------------------------------------
// Deterministic checks — cheap fraud signals, no model in the loop
// ---------------------------------------------------------------------------

export const FLAG_LABELS = {
  duplicate_hash: "Identical file already submitted for another applicant",
  duplicate_resubmit: "Identical file already submitted for this applicant under another document type",
  name_mismatch: "Name on the document does not match the applicant record",
  missing_field: "Expected fields could not be found in the document",
  future_date: "Document carries a date in the future",
  expired_document: "Document validity date has passed",
  unreadable: "No machine-readable text — reviewer must read the file directly",
};

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|miss|thiru|selvi|kum)\.?\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Deliberately lenient: initials, reordered name parts and a missing middle
// name are all normal in Tamil Nadu records and must not raise a flag. We only
// flag when there is no meaningful token overlap at all.
export function namesMatch(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return true;
  if (left === right) return true;

  const leftTokens = left.split(" ").filter((token) => token.length > 1);
  const rightTokens = right.split(" ").filter((token) => token.length > 1);
  if (!leftTokens.length || !rightTokens.length) return true;

  const shared = leftTokens.filter((token) => rightTokens.includes(token));
  return shared.length > 0;
}

function parseLooseDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Rule-based flags for one document. Every branch here is a plain comparison —
 * nothing infers intent, nothing decides validity. The output is a list of
 * things a human should look at first, sorted into the queue ahead of clean
 * documents.
 *
 * @param {object} params
 * @param {object} params.applicant         the applicant row the document belongs to
 * @param {object} params.extractedFields   assistive pre-fill (may be empty)
 * @param {string} params.extractionSource  how the pre-fill was produced
 * @param {Array}  params.hashMatches       existing submissions sharing this file hash
 * @param {Array}  params.expectedFields    field keys this document type should carry
 * @param {Date}   params.now               injected for testability
 */
export function computeFlags({
  applicant,
  extractedFields = {},
  extractionSource = "none",
  hashMatches = [],
  expectedFields = [],
  now = new Date(),
}) {
  const flags = [];
  const details = {};

  const foreignMatch = hashMatches.find((match) => match.applicantId !== applicant.applicantId);
  if (foreignMatch) {
    flags.push("duplicate_hash");
    details.duplicate_hash = {
      applicantId: foreignMatch.applicantId,
      collegeId: foreignMatch.collegeId,
      documentType: foreignMatch.documentType,
      submittedAt: foreignMatch.createdAt,
    };
  }

  const selfMatch = hashMatches.find((match) => match.applicantId === applicant.applicantId);
  if (selfMatch) {
    flags.push("duplicate_resubmit");
    details.duplicate_resubmit = { documentType: selfMatch.documentType };
  }

  if (extractionSource === "none" || extractionSource === "unsupported") {
    flags.push("unreadable");
    details.unreadable = { extractionSource };
  } else {
    const missing = expectedFields.filter((field) => !String(extractedFields[field] ?? "").trim());
    if (missing.length) {
      flags.push("missing_field");
      details.missing_field = { fields: missing };
    }

    if (extractedFields.name && !namesMatch(extractedFields.name, applicant.name)) {
      flags.push("name_mismatch");
      details.name_mismatch = { onDocument: extractedFields.name, onRecord: applicant.name };
    }
  }

  const issueDate = parseLooseDate(extractedFields.issueDate);
  if (issueDate && issueDate.getTime() > now.getTime()) {
    flags.push("future_date");
    details.future_date = { issueDate: extractedFields.issueDate };
  }

  const validUntil = parseLooseDate(extractedFields.validUntil);
  if (validUntil && validUntil.getTime() < now.getTime()) {
    flags.push("expired_document");
    details.expired_document = { validUntil: extractedFields.validUntil };
  }

  return { flags, flagDetails: details };
}

// ---------------------------------------------------------------------------
// Applicant status is derived, never set by hand
// ---------------------------------------------------------------------------

/**
 * Verifying one document must not verify the applicant. The applicant's status
 * is recomputed from the full required-document checklist every time.
 */
export function deriveApplicantStatus(program, documents = []) {
  const required = requiredDocumentsFor(program);
  const byType = new Map();
  documents.forEach((doc) => byType.set(doc.documentType, doc));

  const checklist = required.map((type) => {
    const doc = byType.get(type);
    return {
      documentType: type,
      label: DOCUMENT_LABELS[type] || type,
      status: doc ? doc.status : "missing",
      documentId: doc ? String(doc._id) : null,
      flags: doc ? doc.flags || [] : [],
    };
  });

  const verifiedCount = checklist.filter((item) => item.status === "verified").length;
  const rejected = checklist.filter((item) => item.status === "rejected");
  const anyReviewed = documents.some((doc) => doc.status !== "pending");

  let status;
  if (rejected.length) status = "rejected";
  else if (verifiedCount === required.length) status = "verified";
  else if (anyReviewed) status = "under_review";
  else status = "submitted";

  return {
    status,
    checklist,
    verifiedCount,
    requiredCount: required.length,
    rejectedTypes: rejected.map((item) => item.documentType),
  };
}
