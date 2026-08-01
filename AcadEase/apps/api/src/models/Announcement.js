import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    audience: { type: String, enum: ["all", "students", "faculty"], default: "all" },
    createdBy: { type: String, required: true },
    institutionId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Announcement", announcementSchema);
