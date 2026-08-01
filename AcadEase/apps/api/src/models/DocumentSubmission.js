import mongoose from "mongoose";

// Kept as a literal rather than imported from utils/reviewGate.js: that module
// reaches models/index.js transitively, and a cycle would leave this enum
// undefined at schema-compile time.
const REVIEW_STAGES = ["college", "tnteu", "complete"];

// One uploaded admission proof. `extractedFields` is assistive pre-fill only —
// a human reviewer confirms or corrects it before the document can be verified.
// `flags` are deterministic rule-based warnings, never auto-rejections.
const documentSubmissionSchema = new mongoose.Schema(
  {
    applicantId: { type: String, required: true, index: true },
    collegeId: { type: String, required: true, index: true },
    documentType: { type: String, required: true, index: true },

    // Stored outside the statically served directory; never the client filename.
    // What is on disk is ciphertext — see utils/documentCrypto.js.
    storedName: { type: String, required: true },
    filePath: { type: String, required: true },
    originalName: { type: String, default: null },
    mimeType: { type: String, default: null },
    size: { type: Number, default: 0 },
    // SHA-256 of the PLAINTEXT, so duplicate detection still works across
    // documents encrypted under different keys.
    fileHash: { type: String, required: true, index: true },

    // Envelope encryption metadata. `wrappedKeys` holds the file's data key
    // sealed once for TNTEU and once for the owning university — nobody else
    // has a key path to the contents.
    encryption: {
      algorithm: { type: String, default: null },
      keyWrap: { type: String, default: null },
      iv: { type: String, default: null },
      authTag: { type: String, default: null },
      wrappedKeys: { type: mongoose.Schema.Types.Mixed, default: {} },
      encryptedAt: { type: Date, default: null },
    },

    // Result of the instant checks run at upload time, kept so the reviewer
    // sees what the applicant was already told.
    qrCheck: {
      status: { type: String, default: null },
      headline: { type: String, default: null },
      detail: { type: String, default: null },
      link: { type: String, default: null },
      issuerHost: { type: String, default: null },
      certId: { type: String, default: null },
      payloads: [{ type: String }],
      checkedAt: { type: Date, default: null },
    },
    // Did this file read as the document type it was filed under? Keyword
    // identification only — see utils/tnDocuments.js.
    typeCheck: {
      verdict: { type: String, default: null }, // match | mismatch | unconfirmed
      detectedType: { type: String, default: null },
      detail: { type: String, default: null },
    },

    // Where there is no QR, this is the manual route: issuer, portal, the
    // extracted lookup handle, and the exact fields to compare.
    verificationGuidance: { type: mongoose.Schema.Types.Mixed, default: null },

    qualityMetrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    qualityWarnings: [{ type: String }],
    uploadedByRole: { type: String, default: null },

    extractedFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    extractionSource: { type: String, default: "none" }, // "pdf_text" | "none" | "unsupported"
    fieldsConfirmedBy: { type: String, default: null },

    flags: [{ type: String }],
    flagDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
    flagCount: { type: Number, default: 0, index: true },

    // False while an applicant is still assembling their application. Only a
    // submitted application reaches TNTEU's queue — a half-finished draft must
    // not consume reviewer attention.
    queued: { type: Boolean, default: true, index: true },

    // ── Two-stage review chain ──────────────────────────────────────────────
    // Every document is approved twice, by two different institutions, in a
    // fixed order: the university that submitted it, then TNTEU. `reviewStage`
    // is the single source of truth for whose desk it is on right now, so a
    // reviewer physically cannot act out of turn.
    //
    //   college  → waiting on the submitting university
    //   tnteu    → university approved it; waiting on TNTEU
    //   complete → finally verified, or rejected at either stage
    reviewStage: { type: String, enum: REVIEW_STAGES, default: "college", index: true },

    collegeReview: {
      decision: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
      by: { type: String, default: null },
      byName: { type: String, default: null },
      at: { type: Date, default: null },
      reason: { type: String, default: null },
      mode: { type: String, default: null }, // "bulk" | "individual"
    },
    tnteuReview: {
      decision: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
      by: { type: String, default: null },
      byName: { type: String, default: null },
      at: { type: Date, default: null },
      reason: { type: String, default: null },
      mode: { type: String, default: null },
    },

    // RSA-PSS counter-signatures, one per decision, each signing over the one
    // before it (utils/approvalChain.js). A decision cannot be forged by a
    // party that does not hold the institution's private key, and neither link
    // can be removed or reordered without breaking every signature after it.
    approvals: [{ type: mongoose.Schema.Types.Mixed }],

    // Outcome of the at-approval-time re-hash of the file on disk.
    integrityCheckedAt: { type: Date, default: null },
    integrityOk: { type: Boolean, default: null },

    // The overall outcome. Only TNTEU's approval can set this to "verified" —
    // a university approval merely advances the stage.
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
    verifiedBy: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },

    uploadedBy: { type: String, default: null },
    batchId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

// The verification queue sorts flagged-first, then oldest-first. This index
// backs that sort so the queue never needs an in-memory sort.
documentSubmissionSchema.index({ queued: 1, status: 1, flagCount: -1, createdAt: 1 });
// The stage-scoped queue: each reviewer only ever sees the documents currently
// on their own desk, ordered flagged-first then oldest-first.
documentSubmissionSchema.index({ reviewStage: 1, queued: 1, status: 1, flagCount: -1, createdAt: 1 });
documentSubmissionSchema.index({ collegeId: 1, reviewStage: 1, status: 1 });
documentSubmissionSchema.index({ collegeId: 1, status: 1 });
documentSubmissionSchema.index({ applicantId: 1, documentType: 1 }, { unique: true });

export default mongoose.model("DocumentSubmission", documentSubmissionSchema);
