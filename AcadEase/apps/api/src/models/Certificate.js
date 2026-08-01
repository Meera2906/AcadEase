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

    // The counter-signature chain, snapshotted at issue. Each link is an
    // RSA-PSS signature by one institution over its own decision plus the
    // signature before it, so the order and content of the approvals cannot be
    // altered after the fact. Unlike the HMAC above, these can be verified by
    // anyone without giving them the power to forge one.
    approvalChain: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // TNTEU's signature over the finished certificate itself.
    issuerSignature: { type: String, default: null },
    issuerKeyId: { type: String, default: null },
    issuerKeyFingerprint: { type: String, default: null },
    signatureAlgorithm: { type: String, default: null },
    status: { type: String, enum: ["active", "revoked"], default: "active" },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: String, default: null },
    revokedReason: { type: String, default: "" },

    // A certificate is revoked for one of two reasons, and the difference
    // matters to whoever scans the QR: "manual" means the institution withdrew
    // it, "superseded" means the record behind it was corrected and a
    // replacement was issued. The latter is never a black mark on the student.
    revocationType: { type: String, enum: ["manual", "superseded"], default: null },
    // Set on the old certificate: the replacement that took its place.
    supersededBy: { type: String, default: null },
    // Set on the new certificate: the one it replaced.
    supersedes: { type: String, default: null },
    // The grievance whose resolution triggered the reissue, if any.
    reissuedFromGrievance: { type: mongoose.Schema.Types.ObjectId, ref: "Grievance", default: null },

    // Download
    pdfPath: { type: String, required: true }, // server-side storage path
    downloadUrlToken: { type: String, default: null }, // signed, short-lived
    downloadUrlExpiresAt: { type: Date, default: null },
    downloadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Certificate", certificateSchema);
