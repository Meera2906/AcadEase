import mongoose from "mongoose";

// An applicant is a person a university (college) has put forward to TNTEU for
// admission approval. Applicants are NOT users — they only become a `student`
// User once TNTEU has verified every required document and the university
// enrolls them.
const applicantSchema = new mongoose.Schema(
  {
    applicantId: { type: String, required: true, unique: true, index: true },
    collegeId: { type: String, required: true, index: true },
    batchId: { type: String, default: null, index: true },

    name: { type: String, required: true },
    program: { type: String, enum: ["BEd", "MEd"], required: true, index: true },
    dob: { type: String, default: null },
    gender: { type: String, default: null },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null },
    rollNumber: { type: String, default: null, index: true },
    category: { type: String, default: null },

    // ── Pre-admission self-service account ──────────────────────────────
    // An applicant is not a User. They hold a temporary, tightly scoped login
    // that can do exactly two things: manage their own documents and watch
    // their own status. It stops working the moment they become a student.
    passwordHash: { type: String, default: null },
    refreshTokenHash: { type: String, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    source: { type: String, enum: ["self", "university_bulk"], default: "university_bulk" },

    // Self-declared marks, checked against the uploaded documents by a human
    // before enrolment. Drives the deterministic eligibility gate.
    tenthPercentage: { type: Number, default: null },
    twelfthPercentage: { type: Number, default: null },
    ugPercentage: { type: Number, default: null },
    bedPercentage: { type: Number, default: null },

    eligibility: {
      eligible: { type: Boolean, default: false },
      evaluatedAt: { type: Date, default: null },
      minimumRequired: { type: Number, default: null },
      blockers: [{ type: String }],
    },

    // "draft" while the applicant is still uploading; only a submitted
    // application enters TNTEU's queue.
    stage: {
      type: String,
      enum: ["draft", "submitted", "enrolled"],
      default: "submitted",
      index: true,
    },

    status: {
      type: String,
      enum: ["submitted", "under_review", "verified", "rejected"],
      default: "submitted",
      index: true,
    },

    submittedAt: { type: Date, default: Date.now },
    submittedBy: { type: String, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },

    // Set once the applicant is verified and the university converts them into
    // a login-capable student. Certificates hang off this account.
    studentUserId: { type: String, default: null, index: true },
    enrolledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

applicantSchema.index({ collegeId: 1, status: 1, submittedAt: -1 });
applicantSchema.index({ collegeId: 1, rollNumber: 1 });
applicantSchema.index({ email: 1 });

export default mongoose.model("Applicant", applicantSchema);
