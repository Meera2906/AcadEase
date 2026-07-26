import mongoose from "mongoose";

const xpLedgerSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    event: {
      type: String,
      enum: ["on_time_submission", "full_attendance_week", "early_certificate_request", "streak_milestone"],
      required: true,
    },
    points: { type: Number, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("XpLedger", xpLedgerSchema);
