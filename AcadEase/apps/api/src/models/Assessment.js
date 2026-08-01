import mongoose from "mongoose";

const assessmentSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["IA1", "IA2", "Assignment", "Lab Record", "Model Exam", "University Exam"],
      required: true,
    },
    title: { type: String, required: true },
    maxMarks: { type: Number, required: true },
    dueDate: { type: Date },
    createdBy: { type: String, required: true }, // facultyId or adminId
    marksPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Assessment", assessmentSchema);
