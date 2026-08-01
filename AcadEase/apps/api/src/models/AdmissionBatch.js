import mongoose from "mongoose";

// A single bulk submission from a university: the CSV of applicant rows plus
// whatever document files were attached to it. Keeps the per-row import report
// retrievable after the upload response is gone.
const admissionBatchSchema = new mongoose.Schema(
  {
    batchId: { type: String, required: true, unique: true, index: true },
    collegeId: { type: String, required: true, index: true },
    uploadedBy: { type: String, required: true },
    kind: { type: String, enum: ["applicants", "documents"], required: true },
    fileName: { type: String, default: null },

    totalRows: { type: Number, default: 0 },
    imported: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    flagged: { type: Number, default: 0 },

    // Bounded so a 10k-row CSV cannot blow up a single document.
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    truncatedRows: { type: Number, default: 0 },
  },
  { timestamps: true }
);

admissionBatchSchema.index({ collegeId: 1, createdAt: -1 });

export default mongoose.model("AdmissionBatch", admissionBatchSchema);
