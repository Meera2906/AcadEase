import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: [
        "absent_alert",
        "od_status",
        "marks_published",
        "result_published",
        "certificate_ready",
        "grievance_update",
        "attendance_warning",
        "low_attendance_alert",
        "streak_milestone",
        "assessment_reminder",
        "announcement",
      ],
      required: true,
    },
    priority: { type: String, enum: ["critical", "high", "medium", "low"], default: "medium" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    linkTo: { type: String, default: null }, // deep link, e.g. /student/od-request/new?course=CS301
    read: { type: Boolean, default: false, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
