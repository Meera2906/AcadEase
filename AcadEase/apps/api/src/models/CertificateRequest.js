import mongoose from "mongoose";

// One signed link in a two-institution approval chain. See utils/approvalChain.js.
export const approvalSchema = new mongoose.Schema(
  {
    stage: { type: String, required: true },
    decision: { type: String, enum: ["approved", "rejected"], required: true },
    actorId: { type: String, required: true },
    actorName: { type: String, default: null },
    actorRole: { type: String, required: true },
    keyId: { type: String, required: true },
    keyFingerprint: { type: String, default: null },
    remarks: { type: String, default: "" },
    decidedAt: { type: Date, required: true },
    algorithm: { type: String, required: true },
    previousSignature: { type: String, required: true },
    signature: { type: String, required: true },
    payloadDigest: { type: String, required: true },
  },
  { _id: false }
);

const certificateRequestSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["bonafide", "completion", "attendance", "character", "merit"],
      required: true,
    },
    purpose: { type: String, required: true },
    notes: { type: String, default: "" },

    // Where the request currently sits. It travels up the chain
    // (college → TNTEU) and the outcome travels back down to the student.
    stage: {
      type: String,
      enum: ["college_review", "tnteu_review", "issued", "rejected"],
      default: "college_review",
      index: true,
    },
    // Which role has to act next — drives each dashboard's work queue.
    awaitingRole: { type: String, default: "college_admin", index: true },

    // One counter-signature per institution that acted. Append-only.
    approvals: { type: [approvalSchema], default: [] },

    // Retained for the existing UI; derived from `stage`.
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    rejectionReason: { type: String, default: "" },
    rejectedBy: { type: String, default: null },
    rejectedStage: { type: String, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    certificateId: { type: mongoose.Schema.Types.ObjectId, ref: "Certificate", default: null },
  },
  { timestamps: true }
);

certificateRequestSchema.index({ collegeId: 1, stage: 1, createdAt: -1 });
certificateRequestSchema.index({ awaitingRole: 1, stage: 1 });

export default mongoose.model("CertificateRequest", certificateRequestSchema);
