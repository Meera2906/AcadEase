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
    storedName: { type: String, required: true },
    filePath: { type: String, required: true },
    originalName: { type: String, default: null },
    mimeType: { type: String, default: null },
    size: { type: Number, default: 0 },
    fileHash: { type: String, required: true, index: true },

    extractedFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    extractionSource: { type: String, default: "none" }, // "pdf_text" | "none" | "unsupported"
    fieldsConfirmedBy: { type: String, default: null },

    flags: [{ type: String }],
    flagDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
    flagCount: { type: Number, default: 0, index: true },

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
documentSubmissionSchema.index({ status: 1, flagCount: -1, createdAt: 1 });
documentSubmissionSchema.index({ collegeId: 1, status: 1 });
documentSubmissionSchema.index({ applicantId: 1, documentType: 1 }, { unique: true });

export default mongoose.model("DocumentSubmission", documentSubmissionSchema);
