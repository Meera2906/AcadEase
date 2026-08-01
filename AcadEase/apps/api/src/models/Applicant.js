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

export default mongoose.model("Applicant", applicantSchema);
