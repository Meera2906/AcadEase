import mongoose from "mongoose";

const attendanceRecordSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    facultyId: { type: String, required: true },
    date: { type: Date, required: true }, // date only, no time
    sessionTime: { type: String, default: "09:00" },
    status: {
      type: String,
      enum: ["present", "absent", "od", "late", "holiday"],
      required: true,
    },
    odRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "ODRequest", default: null },
    markedAt: { type: Date, default: Date.now },
    editedAt: { type: Date, default: null },
    editedBy: { type: String, default: null },
    note: { type: String, default: "" }, // faculty-only, admin-visible
    supportingDocPath: { type: String, default: null }, // optional proof/document for absence reason
  },
  { timestamps: true }
);

attendanceRecordSchema.index({ courseId: 1, studentId: 1, date: 1 }, { unique: true });
attendanceRecordSchema.index({ studentId: 1, status: 1 });

export default mongoose.model("AttendanceRecord", attendanceRecordSchema);
