import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: String, required: true, index: true },
    actorRole: { type: String, required: true, index: true },
    action: { type: String, required: true },
    collegeId: { type: String, default: null, index: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "timestamp", updatedAt: false } }
);

auditLogSchema.index({ collegeId: 1, timestamp: -1 });

auditLogSchema.index({ action: 1, timestamp: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
