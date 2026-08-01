import mongoose from "mongoose";

const marksSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assessment", required: true, index: true },
    courseId: { type: String, required: true },
    studentId: { type: String, required: true, index: true },
    marksObtained: { type: Number, default: null }, // null = not yet submitted
    isAbsent: { type: Boolean, default: false }, // "AB" flag — never shown as 0
    optedOutOfLeaderboard: { type: Boolean, default: false },
    submittedAt: { type: Date, default: null },
    editedAt: { type: Date, default: null },
    editedBy: { type: String, default: null },
  },
  { timestamps: true }
);

marksSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });

export default mongoose.model("Marks", marksSchema);
