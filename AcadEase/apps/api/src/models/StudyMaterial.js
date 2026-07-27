import mongoose from "mongoose";

const studyMaterialSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, enum: ["general", "tet"], default: "general" },
    audience: { type: String, enum: ["all", "students", "faculty"], default: "all" },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    mimeType: { type: String, default: "application/octet-stream" },
    fileSize: { type: Number, default: 0 },
    uploadedBy: { type: String, required: true },
    institutionId: { type: String, required: true },
    departmentId: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

studyMaterialSchema.index({ institutionId: 1, category: 1, audience: 1, isActive: 1, createdAt: -1 });

export default mongoose.model("StudyMaterial", studyMaterialSchema);
