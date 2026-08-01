import mongoose from "mongoose";

// A circular is a notice pushed down the hierarchy: TNTEU to every affiliated
// college, or a college to its own people. Who receives it is a set, not a
// single choice — a fee-revision circular usually goes to students *and* the
// office, and only rarely to exactly one group.
export const CIRCULAR_AUDIENCES = ["students", "faculty", "admins"];

const ROLE_TO_AUDIENCE = {
  student: "students",
  faculty: "faculty",
  college_admin: "admins",
  college_coordinator: "admins",
  tnteu_admin: "admins",
  admin: "admins",
  superadmin: "admins",
};

export function audienceForRole(role) {
  return ROLE_TO_AUDIENCE[role] || "students";
}

// The roles a given audience group resolves to when the circular is fanned out
// into per-user notifications.
export function rolesForAudiences(audiences = []) {
  const roles = new Set();
  audiences.forEach((group) => {
    Object.entries(ROLE_TO_AUDIENCE).forEach(([role, mapped]) => {
      if (mapped === group) roles.add(role);
    });
  });
  return [...roles];
}

// Accepts the multi-select array, a single legacy value, or "all".
export function normalizeAudiences(input) {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];

  const cleaned = raw
    .map((value) => String(value).trim().toLowerCase())
    .flatMap((value) => (value === "all" || value === "everyone" ? CIRCULAR_AUDIENCES : [value]))
    .map((value) => (value === "student" ? "students" : value === "admin" ? "admins" : value))
    .filter((value) => CIRCULAR_AUDIENCES.includes(value));

  const unique = [...new Set(cleaned)];
  return unique.length > 0 ? unique : [...CIRCULAR_AUDIENCES];
}

const announcementSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },

    audiences: {
      type: [String],
      enum: CIRCULAR_AUDIENCES,
      default: () => [...CIRCULAR_AUDIENCES],
      index: true,
    },
    // Kept in step with `audiences` so circulars written before the multi-select
    // still read correctly, and so old clients keep working.
    audience: { type: String, enum: ["all", "students", "faculty", "admins"], default: "all" },

    // "university" circulars are TNTEU-wide and reach every affiliated college;
    // "college" circulars stay inside the college that issued them.
    scope: { type: String, enum: ["university", "college"], default: "college", index: true },

    createdBy: { type: String, required: true },
    createdByName: { type: String, default: null },
    createdByRole: { type: String, default: null },
    institutionId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

announcementSchema.index({ scope: 1, createdAt: -1 });

export default mongoose.model("Announcement", announcementSchema);
