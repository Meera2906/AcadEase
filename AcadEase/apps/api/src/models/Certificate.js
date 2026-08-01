import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    certId: { type: String, required: true, unique: true, index: true }, // UUID v4
    studentId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["bonafide", "completion", "attendance", "character", "merit"],
      required: true,
    },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "CertificateRequest", required: true },
    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: String, required: true }, // adminId
    institutionId: { type: String, required: true },

    // Immutable content snapshot — what was true at time of issue
    studentName: { type: String, required: true },
    enrollmentNumber: { type: String, required: true },
    department: { type: String, required: true },
    academicYear: { type: String, required: true },
    purpose: { type: String, required: true },

    // Anti-spoofing (see docs/PRD Section 9)
    hmacSignature: { type: String, required: true }, // HMAC-SHA256(certId+studentId+issuedAt+type+institutionId)
    status: { type: String, enum: ["active", "revoked"], default: "active" },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: String, default: null },
    revokedReason: { type: String, default: "" },

    // Download
    pdfPath: { type: String, required: true }, // server-side storage path
    downloadUrlToken: { type: String, default: null }, // signed, short-lived
    downloadUrlExpiresAt: { type: Date, default: null },
    downloadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Certificate", certificateSchema);
