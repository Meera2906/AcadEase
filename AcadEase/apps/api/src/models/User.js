import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true }, // STU_2021_CS_001, FAC_CSE_023, ADM_CSE_001
    role: {
      type: String,
      enum: ["student", "faculty", "admin", "superadmin"],
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String },
    passwordHash: { type: String, required: true },

    // 2FA — mandatory for faculty/admin/superadmin, unused for students in MVP
    totpSecret: { type: String, default: null },
    totpEnabled: { type: Boolean, default: false },

    institutionId: { type: String, required: true, index: true },
    departmentId: { type: String, required: true, index: true },

    // Student-specific
    semester: { type: Number },
    section: { type: String },
    batchYear: { type: Number },
    enrollmentNumber: { type: String },
    attendanceOptOut: { type: Boolean, default: false }, // leaderboard opt-out
    resumePath: { type: String, default: null }, // uploaded resume file path

    // Student profile extras
    dob: { type: String, default: null },
    linkedin: { type: String, default: null },
    college: { type: String, default: null },
    batch: { type: String, default: null },
    department: { type: String, default: null },
    tenth: { type: Number, default: null },
    twelfth: { type: Number, default: null },
    diploma: { type: Number, default: null },
    ugPercentage: { type: Number, default: null },
    backlogs: { type: Number, default: 0 },
    currentBacklogs: { type: Number, default: 0 },
    interests: { type: String, default: null },

    // Faculty-specific
    designation: { type: String },
    courseIds: [{ type: String }],

    // Auth hardening
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    refreshTokenHash: { type: String, default: null },
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ institutionId: 1, departmentId: 1, role: 1 });

export default mongoose.model("User", userSchema);
