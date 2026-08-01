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
  },
  { timestamps: true }
);

export default mongoose.model("Grievance", grievanceSchema);
