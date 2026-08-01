import mongoose from "mongoose";

const collegeSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    affiliationCode: { type: String, default: null },
    address: { type: String, default: null },
    district: { type: String, default: null },
    principalName: { type: String, default: null },
    principalContact: { type: String, default: null },
    bedSeats: { type: Number, default: 100 },
    medSeats: { type: Number, default: 50 },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  },
  { timestamps: true }
);

export default mongoose.model("College", collegeSchema);
