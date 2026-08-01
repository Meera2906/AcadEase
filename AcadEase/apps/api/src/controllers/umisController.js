// UMIS — the state's Unified Management Information System register.
//
// TNTEU's registrar needs to look up any student at any affiliated college
// without going through that college's office. This is that lookup: read-only,
// cross-college, and deliberately without a single write path. Nothing here
// mutates a record; a correction is still the college's job.
import {
  User,
  College,
  Department,
  Applicant,
  AttendanceRecord,
  Result,
  Certificate,
  AuditLog,
} from "../models/index.js";

const UMIS_ROLES = ["tnteu_admin", "superadmin"];

function assertUmisAccess(req) {
  if (!UMIS_ROLES.includes(req.user.role)) {
    throw Object.assign(new Error("UMIS access is limited to TNTEU"), { status: 403 });
  }
}

// The UMIS identifier the state uses. Derived, not stored — the register is a
// view over the records the colleges already submitted.
function umisId(student) {
  const college = (student.collegeId || "TNTEU").replace(/[^0-9]/g, "").slice(-4) || "0000";
  const roll = (student.enrollmentNumber || student.userId || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `UMIS${college}${roll.slice(-8)}`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/umis/filters — the dropdown contents for the register
export async function getUmisFilters(req, res) {
  assertUmisAccess(req);

  const [colleges, departments, batchYears] = await Promise.all([
    College.find({}).select("collegeId name district status").sort({ name: 1 }).lean(),
    Department.find({}).select("departmentId name code collegeId").sort({ name: 1 }).lean(),
    User.distinct("batchYear", { role: "student", batchYear: { $ne: null } }),
  ]);

  res.json({
    colleges,
    departments,
    batchYears: batchYears.filter(Boolean).sort((a, b) => b - a),
    statuses: ["active", "inactive"],
  });
}

// GET /api/umis/students — the register itself
export async function listUmisStudents(req, res) {
  assertUmisAccess(req);

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const skip = (page - 1) * limit;

  const filter = { role: "student" };
  if (req.query.collegeId) filter.collegeId = String(req.query.collegeId);
  if (req.query.departmentId) filter.departmentId = String(req.query.departmentId);
  if (req.query.batchYear) filter.batchYear = Number(req.query.batchYear);
  if (req.query.semester) filter.semester = Number(req.query.semester);
  if (req.query.status === "active") filter.isActive = { $ne: false };
  if (req.query.status === "inactive") filter.isActive = false;

  const q = String(req.query.q || "").trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { email: rx }, { userId: rx }, { enrollmentNumber: rx }];
  }

  const [students, total] = await Promise.all([
    User.find(filter)
      .select("userId name email phone collegeId institutionId departmentId semester section batchYear enrollmentNumber isActive lastLogin createdAt")
      .sort({ collegeId: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const [colleges, departments] = await Promise.all([
    College.find({ collegeId: { $in: [...new Set(students.map((s) => s.collegeId))] } })
      .select("collegeId name district")
      .lean(),
    Department.find({ departmentId: { $in: [...new Set(students.map((s) => s.departmentId))] } })
      .select("departmentId name code")
      .lean(),
  ]);
  const collegeById = new Map(colleges.map((c) => [c.collegeId, c]));
  const deptById = new Map(departments.map((d) => [d.departmentId, d]));

  // Which of these students came in through the TNTEU admission pipeline —
  // useful because a UMIS row with no admission record is worth a second look.
  const admissions = await Applicant.find({ studentUserId: { $in: students.map((s) => s.userId) } })
    .select("studentUserId applicantId program status enrolledAt")
    .lean();
  const admissionByStudent = new Map(admissions.map((a) => [a.studentUserId, a]));

  res.json({
    students: students.map((s) => {
      const admission = admissionByStudent.get(s.userId) || null;
      return {
        umisId: umisId(s),
        userId: s.userId,
        name: s.name,
        email: s.email,
        phone: s.phone || null,
        collegeId: s.collegeId,
        collegeName: collegeById.get(s.collegeId)?.name || s.collegeId || "—",
        district: collegeById.get(s.collegeId)?.district || null,
        departmentId: s.departmentId,
        departmentName: deptById.get(s.departmentId)?.name || s.departmentId || "—",
        programme: admission?.program || null,
        semester: s.semester ?? null,
        section: s.section || null,
        batchYear: s.batchYear ?? null,
        enrollmentNumber: s.enrollmentNumber || null,
        status: s.isActive === false ? "inactive" : "active",
        admissionId: admission?.applicantId || null,
        enrolledAt: admission?.enrolledAt || s.createdAt,
        lastLogin: s.lastLogin || null,
      };
    }),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

// GET /api/umis/students/:userId — the single record, read-only
export async function getUmisStudent(req, res) {
  assertUmisAccess(req);

  const student = await User.findOne({ userId: req.params.userId, role: "student" })
    .select("-passwordHash -totpSecret -refreshTokenHash -passwordResetToken -passwordResetExpires")
    .lean();
  if (!student) return res.status(404).json({ error: "No UMIS record for that student" });

  const [college, department, admission, records, results, certificates] = await Promise.all([
    College.findOne({ collegeId: student.collegeId }).select("collegeId name district affiliationCode").lean(),
    Department.findOne({ departmentId: student.departmentId }).select("departmentId name code").lean(),
    Applicant.findOne({ studentUserId: student.userId })
      .select("applicantId program category status stage submittedAt enrolledAt tenthPercentage twelfthPercentage ugPercentage bedPercentage")
      .lean(),
    AttendanceRecord.find({ studentId: student.userId, status: { $ne: "holiday" } }).select("status date").lean(),
    Result.find({ studentId: student.userId }).sort({ semester: 1 }).lean(),
    Certificate.find({ studentId: student.userId }).select("certId type issuedAt status").sort({ issuedAt: -1 }).lean(),
  ]);

  const attended = records.filter((r) => ["present", "od", "late"].includes(r.status)).length;

  // Every read of a student's file is logged — an open register still has to be
  // an accountable one.
  AuditLog.create({
    actorId: req.user.userId,
    actorRole: req.user.role,
    action: "umis_student_viewed",
    collegeId: student.collegeId,
    targetType: "User",
    targetId: student.userId,
    metadata: { umisId: umisId(student) },
  }).catch(() => {});

  res.json({
    record: {
      umisId: umisId(student),
      student,
      college,
      department,
      admission,
      attendance: {
        total: records.length,
        attended,
        percentage: records.length ? Math.round((attended / records.length) * 1000) / 10 : null,
      },
      results,
      certificates,
    },
    readOnly: true,
  });
}
