import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, unique: true }, // "CS301"
    name: { type: String, required: true }, // "Database Management Systems"
    departmentId: { type: String, required: true, index: true },
    institutionId: { type: String, default: null, index: true },
    semester: { type: Number, required: true },
    section: { type: String, default: "A" },
    facultyId: { type: String, required: true, index: true },
    academicYear: { type: String, required: true }, // "2024-2025"
  },
  { timestamps: true }
);

export default mongoose.model("Course", courseSchema);
