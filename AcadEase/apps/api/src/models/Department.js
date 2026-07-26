import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    departmentId: { type: String, required: true, unique: true }, // "CSE_2024"
    institutionId: { type: String, required: true, index: true },
    name: { type: String, required: true }, // "Computer Science and Engineering"
    code: { type: String, required: true }, // "CSE"
    hodUserId: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Department", departmentSchema);
