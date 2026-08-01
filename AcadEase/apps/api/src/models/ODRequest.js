import mongoose from "mongoose";

const odRequestSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    courseId: { type: String, required: true },
    facultyId: { type: String, required: true, index: true },
    attendanceRecordId: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceRecord" },
    date: { type: Date, required: true },
    reasonType: {
      type: String,
      enum: ["Placement Drive", "Medical", "Event", "Personal", "Other"],
      required: true,
    },
    reasonDetails: { type: String, maxlength: 300, default: "" },
    supportingDocPath: { type: String, default: null }, // PDF/JPG, max 2MB, validated at upload
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    facultyNote: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("ODRequest", odRequestSchema);
