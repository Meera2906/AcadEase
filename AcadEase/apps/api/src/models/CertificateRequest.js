import mongoose from "mongoose";

const certificateRequestSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["bonafide", "completion", "attendance", "character", "merit"],
      required: true,
    },
    purpose: { type: String, required: true },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    rejectionReason: { type: String, default: "" },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    certificateId: { type: mongoose.Schema.Types.ObjectId, ref: "Certificate", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("CertificateRequest", certificateRequestSchema);
