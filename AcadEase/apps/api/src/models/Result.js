import mongoose from "mongoose";

const resultSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    semester: { type: Number, required: true },
    academicYear: { type: String, required: true },
    subjects: [
      {
        courseId: String,
        courseName: String,
        grade: String,
        marksObtained: Number,
        maxMarks: Number,
        result: { type: String, enum: ["pass", "fail", "pending"], default: "pending" },
      },
    ],
    enteredBy: { type: String, required: true },
    releasedAt: { type: Date, default: null },
    pdfPath: { type: String, default: null },
  },
  { timestamps: true }
);

resultSchema.index({ studentId: 1, semester: 1, academicYear: 1 }, { unique: true });

export default mongoose.model("Result", resultSchema);
