import mongoose from "mongoose";

const studyMaterialSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    moduleType: { type: String, enum: ["academic", "tet"], default: "academic" },
    subject: { type: String, default: "General" },
    contentType: { type: String, enum: ["video", "text", "textbook", "quiz", "paper", "note", "syllabus", "guide"], default: "text" },
    audience: { type: String, enum: ["all", "students", "faculty"], default: "all" },
    fileName: { type: String, default: "" },
    filePath: { type: String, default: "" },
    mimeType: { type: String, default: "application/octet-stream" },
    fileSize: { type: Number, default: 0 },
    videoUrl: { type: String, default: "" },
    textContent: { type: String, default: "" },
    quizQuestions: { type: Array, default: [] },
    timeLimitMinutes: { type: Number, default: 0 },
    uploadedBy: { type: String, required: true },
    institutionId: { type: String, required: true },
    departmentId: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

studyMaterialSchema.index({ institutionId: 1, moduleType: 1, subject: 1, contentType: 1, isActive: 1, createdAt: -1 });

export default mongoose.model("StudyMaterial", studyMaterialSchema);
