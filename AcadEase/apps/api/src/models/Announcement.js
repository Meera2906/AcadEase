import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    audience: { type: String, enum: ["all", "students", "faculty"], default: "all" },
    createdBy: { type: String, required: true },
    institutionId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Announcement", announcementSchema);
