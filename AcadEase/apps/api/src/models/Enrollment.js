import mongoose from "mongoose";

const enrollmentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, index: true },
    academicYear: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

enrollmentSchema.index({ studentId: 1, courseId: 1, academicYear: 1 }, { unique: true });

export default mongoose.model("Enrollment", enrollmentSchema);
