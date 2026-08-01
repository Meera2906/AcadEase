import fs from "fs";
import path from "path";
import crypto from "crypto";
import { decryptDocument, DecryptionDeniedError } from "./documentCrypto.js";
import { FLAG_LABELS } from "./admissionRules.js";
import { QR_FLAG_LABELS, QR_STATUS } from "./qrAuthenticity.js";

// ---------------------------------------------------------------------------
// The gate that stands in front of bulk approval.
//
// Bulk approval is the whole point of the reviewer screens — a university sends
// two hundred documents and an admin should clear the clean ones in one click.
// But "one click" and "each certificate is genuinely checked" are in direct
// tension, and the only honest way to hold both is to be strict about which
// documents are allowed anywhere near a bulk action:
//
//   clean      — every automated check ran and none of them found anything.
//                Eligible for bulk approval.
//   attention  — a check could not complete (unreadable scan, missing field,
//                type not confirmed). Not evidence of forgery, but nobody has
//                actually established this document is what it claims to be.
//                Individual review only.
//   suspect    — a check positively found something wrong: the same file under
//                another applicant, a name that does not match, a QR that
//                failed to resolve, an expired or future-dated document.
//                Individual review only, and the reviewer is told to reject
//                unless they can explain it.
//
// Nothing here auto-rejects. The gate only decides what may be swept through
// without a human opening it.
// ---------------------------------------------------------------------------

export const REVIEW_STAGES = ["college", "tnteu", "complete"];

export const STAGE_LABELS = {
  college: "University review",
  tnteu: "TNTEU final approval",
  complete: "Decided",
};

// Which stage of the chain a signed-in reviewer is allowed to act at. A
// university admin can only ever act on the first link, TNTEU only the second —
// so neither can skip, replace or short-circuit the other.
export function stageForRole(role) {
  if (["college_admin", "college_coordinator"].includes(role)) return "college";
  if (role === "tnteu_admin") return "tnteu";
  return null;
}

export function nextStageAfter(stage) {
  return stage === "college" ? "tnteu" : "complete";
}

// A positive finding: some check ran and disagreed with the document.
export const SUSPECT_FLAGS = new Set([
  "duplicate_hash",
  "cross_document_mismatch",
  "name_mismatch",
  "expired_document",
  "future_date",
  "qr_check_failed",
  "integrity_failed",
]);

// A check that could not conclude. Absence of evidence, so never treated as
// evidence of absence — it just means a human has to look.
export const ATTENTION_FLAGS = new Set([
  "unreadable",
  "missing_field",
  "type_unconfirmed",
  "duplicate_resubmit",
  "qr_unrecognised",
]);

export const GATE_FLAG_LABELS = {
  ...FLAG_LABELS,
  ...QR_FLAG_LABELS,
  integrity_failed: "Stored file no longer matches the hash recorded at upload",
};

// QR outcomes that are proof the document is bad. The upload path already
// refuses these, so a stored document carrying one means the record was
// written by an older build or edited directly — either way, never bulk it.
const FATAL_QR_STATUSES = new Set([
  QR_STATUS.REVOKED_SOURCE,
  QR_STATUS.TAMPERED_SOURCE,
  QR_STATUS.UNKNOWN_SOURCE_REFERENCE,
  QR_STATUS.HOLDER_MISMATCH,
]);

/**
 * Classify one stored document for the reviewer UI and the bulk gate.
 *
 * @returns {{ severity: "clean"|"attention"|"suspect", bulkEligible: boolean,
 *             blockers: Array<{code: string, severity: string, label: string}> }}
 */
export function assessDocument(doc = {}) {
  const blockers = [];
  const flags = doc.flags || [];

  flags.forEach((flag) => {
    if (SUSPECT_FLAGS.has(flag)) {
      blockers.push({ code: flag, severity: "suspect", label: GATE_FLAG_LABELS[flag] || flag });
    } else if (ATTENTION_FLAGS.has(flag)) {
      blockers.push({ code: flag, severity: "attention", label: GATE_FLAG_LABELS[flag] || flag });
    } else {
      // An unknown flag is still a flag. Defaulting it to "clean" would mean a
      // check added later silently stops blocking bulk approval.
      blockers.push({ code: flag, severity: "attention", label: GATE_FLAG_LABELS[flag] || flag });
    }
  });

  if (FATAL_QR_STATUSES.has(doc.qrCheck?.status)) {
    blockers.push({
      code: "qr_fatal",
      severity: "suspect",
      label: doc.qrCheck?.headline || "QR verification failed outright",
    });
  }

  if (doc.typeCheck?.verdict === "mismatch") {
    blockers.push({
      code: "wrong_document_type",
      severity: "suspect",
      label: doc.typeCheck?.detail || "This file is not the document type it was filed under",
    });
  }

  const severity = blockers.some((item) => item.severity === "suspect")
    ? "suspect"
    : blockers.length
      ? "attention"
      : "clean";

  return { severity, bulkEligible: severity === "clean", blockers };
}

/**
 * The same classification as assessDocument(), expressed as MongoDB aggregation
 * stages so the queue's clean/attention/suspect counts can be computed in the
 * database instead of by loading the whole backlog into memory.
 *
 * Built from the very same flag sets and QR/type rules the in-memory version
 * uses, so the two cannot drift apart as checks are added.
 */
export function severityCountPipeline() {
  const suspectFlags = [...SUSPECT_FLAGS];
  const fatalQr = [...FATAL_QR_STATUSES];

  return [
    {
      $project: {
        severity: {
          $switch: {
            branches: [
              {
                case: {
                  $or: [
                    { $gt: [{ $size: { $setIntersection: [{ $ifNull: ["$flags", []] }, suspectFlags] } }, 0] },
                    { $in: [{ $ifNull: ["$qrCheck.status", ""] }, fatalQr] },
                    { $eq: ["$typeCheck.verdict", "mismatch"] },
                  ],
                },
                then: "suspect",
              },
              // Any remaining flag — classified or not — still means a human
              // has to look, exactly as assessDocument() decides.
              { case: { $gt: [{ $size: { $ifNull: ["$flags", []] } }, 0] }, then: "attention" },
            ],
            default: "clean",
          },
        },
      },
    },
    { $group: { _id: "$severity", count: { $sum: 1 } } },
  ];
}

/**
 * Re-check the stored file against the hash recorded at upload time, at the
 * moment of approval.
 *
 * Everything else in the pipeline judges the file as it was when it arrived.
 * This is the only check that judges the file as it is *now* — it is what
 * catches a ciphertext swapped on disk, a truncated write, or a record edited
 * to point at somebody else's file between upload and sign-off. AES-GCM's auth
 * tag catches tampering with the ciphertext; the hash comparison catches a
 * wholesale substitution of a validly-encrypted different file.
 *
 * @returns {Promise<{ ok: boolean, reason: string|null }>}
 */
export async function verifyStoredIntegrity(doc, { role, collegeId, secureRoot }) {
  const absolute = path.resolve(secureRoot, doc.filePath || "");
  if (!absolute.startsWith(secureRoot + path.sep)) {
    return { ok: false, reason: "Stored path points outside the document store" };
  }
  if (!fs.existsSync(absolute)) {
    return { ok: false, reason: "The stored file is missing from disk" };
  }

  let plaintext;
  try {
    const stored = await fs.promises.readFile(absolute);
    plaintext = doc.encryption?.wrappedKeys
      ? decryptDocument(stored, doc.encryption, { role, collegeId })
      : stored;
  } catch (err) {
    if (err instanceof DecryptionDeniedError) {
      return { ok: false, reason: err.message };
    }
    return { ok: false, reason: "The stored file failed its authenticated-decryption check" };
  }

  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  if (hash !== doc.fileHash) {
    return { ok: false, reason: "The stored file does not match the hash recorded when it was uploaded" };
  }

  return { ok: true, reason: null };
}
