import mongoose from "mongoose";

const grievanceSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    departmentId: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ["Academic", "Administrative", "Infrastructure", "Other"],
      required: true,
    },
    subject: { type: String, required: true },
    description: { type: String, maxlength: 500, required: true },
    attachmentPath: { type: String, default: null },
    status: {
      type: String,
      enum: ["Open", "In Review", "Resolved", "Rejected"],
      default: "Open",
      index: true,
    },
    resolutionNote: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    handledBy: { type: String, default: null }, // adminId
    resolvedAt: { type: Date, default: null },
    satisfactionRating: { type: Number, min: 1, max: 5, default: null },
    resubmittedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Grievance", default: null },

    // Which academic record this grievance disputes. Only a grievance that
    // names a record can trigger the certificate reissue below — a complaint
    // about a broken projector must never touch anyone's certificates.
    relatedRecord: {
      kind: { type: String, enum: ["result", "marks", "attendance"], default: null },
      resultId: { type: mongoose.Schema.Types.ObjectId, ref: "Result", default: null },
      semester: { type: Number, default: null },
      academicYear: { type: String, default: null },
      courseId: { type: String, default: null },
    },

    // What the resolution did to certificates issued from the disputed record.
    // Written by the reissue engine, never by hand, so the grievance itself
    // carries the proof of what was superseded and by what.
    certificateActions: {
      type: [
        new mongoose.Schema(
          {
            oldCertId: { type: String, required: true },
            newCertId: { type: String, default: null },
            certificateType: { type: String, required: true },
            action: { type: String, enum: ["revoked_and_reissued", "revoked_only", "failed"], required: true },
            detail: { type: String, default: "" },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Grievance", grievanceSchema);
