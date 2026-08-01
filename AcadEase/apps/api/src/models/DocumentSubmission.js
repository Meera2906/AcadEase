import mongoose from "mongoose";

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
documentSubmissionSchema.index({ collegeId: 1, status: 1 });
documentSubmissionSchema.index({ applicantId: 1, documentType: 1 }, { unique: true });

export default mongoose.model("DocumentSubmission", documentSubmissionSchema);
