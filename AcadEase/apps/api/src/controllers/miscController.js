import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  Notification,
  User,
  AttendanceRecord,
  CertificateRequest,
  Grievance,
  Assessment,
  Marks,
  Course,
  XpLedger,
  Announcement,
  StudyMaterial,
} from "../models/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resumeDir = path.join(__dirname, "../../storage/resumes");
if (!fs.existsSync(resumeDir)) fs.mkdirSync(resumeDir, { recursive: true });

const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resumeDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user.userId}_resume${ext}`);
  },
});
export const resumeUpload = multer({
  storage: resumeStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx"];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const studyMaterialsDir = path.join(__dirname, "../../storage/study-materials");
if (!fs.existsSync(studyMaterialsDir)) fs.mkdirSync(studyMaterialsDir, { recursive: true });

const studyMaterialStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, studyMaterialsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, safeName);
  },
});

export const studyMaterialUpload = multer({
  storage: studyMaterialStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".jpg", ".jpeg", ".png"];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// ---------- Notifications ----------

// GET /api/notifications
export async function listNotifications(req, res) {
  const notifications = await Notification.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(50);
  res.json({ notifications });
}

// PATCH /api/notifications/read-all
export async function markAllRead(req, res) {
  await Notification.updateMany({ userId: req.user.userId, read: false }, { read: true });
  res.json({ message: "All notifications marked as read" });
}

// PATCH /api/notifications/:id/read
export async function markOneRead(req, res) {
  const { id } = req.params;
  const notification = await Notification.findOneAndUpdate({ _id: id, userId: req.user.userId }, { read: true }, { new: true });
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json({ notification });
}

// POST /api/notifications/subscribe
export async function subscribePush(req, res) {
  // TODO: persist the browser's PushSubscription (endpoint + keys) against
  // the user once VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are configured.
  res.status(202).json({ message: "Push subscription received (stub — wire up VAPID to activate)" });
}

// ---------- Users ----------

// GET /api/users/me
export async function getMe(req, res) {
  const user = await User.findOne({ userId: req.user.userId }).select("-passwordHash -totpSecret -refreshTokenHash");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
}

// PATCH /api/users/me
export async function updateMe(req, res) {
  const { phone, newPassword, name, enrollmentNumber, dob, linkedin, tenth, twelfth, diploma, ugPercentage, backlogs, currentBacklogs, interests, parentPhone } = req.body;
  const user = await User.findOne({ userId: req.user.userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (name) user.name = name.trim();
  if (phone !== undefined) user.phone = phone.trim();
  if (enrollmentNumber !== undefined && user.role === "student") user.enrollmentNumber = enrollmentNumber.trim();
  if (newPassword) user.passwordHash = await bcrypt.hash(newPassword, 12);
  if (user.role === "student") {
    if (dob !== undefined) user.dob = dob;
    if (linkedin !== undefined) user.linkedin = linkedin;
    if (tenth !== undefined) user.tenth = tenth;
    if (twelfth !== undefined) user.twelfth = twelfth;
    if (diploma !== undefined) user.diploma = diploma;
    if (ugPercentage !== undefined) user.ugPercentage = ugPercentage;
    if (backlogs !== undefined) user.backlogs = backlogs;
    if (currentBacklogs !== undefined) user.currentBacklogs = currentBacklogs;
    if (interests !== undefined) user.interests = interests;
    if (parentPhone !== undefined) user.parentPhone = parentPhone;
  }
  await user.save();

  const updated = user.toObject();
  delete updated.passwordHash;
  delete updated.totpSecret;
  delete updated.refreshTokenHash;
  res.json({ message: "Profile updated", user: updated });
}

// POST /api/users/me/resume
export async function uploadResume(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const user = await User.findOne({ userId: req.user.userId });
  if (!user) return res.status(404).json({ error: "User not found" });
  user.resumePath = `storage/resumes/${req.file.filename}`;
  await user.save();
  res.json({ message: "Resume uploaded", resumePath: user.resumePath });
}

// DELETE /api/users/me/resume
export async function deleteResume(req, res) {
  const user = await User.findOne({ userId: req.user.userId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.resumePath) {
    const fullPath = path.join(__dirname, "../../", user.resumePath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    user.resumePath = null;
    await user.save();
  }
  res.json({ message: "Resume deleted" });
}

// ---------- Study materials ----------

export async function uploadStudyMaterial(req, res) {
  const { title, description = "", category = "general", audience = "all" } = req.body;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  if (!title) return res.status(400).json({ error: "title is required" });

  const material = await StudyMaterial.create({
    title: title.trim(),
    description: description.trim(),
    category: ["general", "tet"].includes(category) ? category : "general",
    audience: ["all", "students", "faculty"].includes(audience) ? audience : "all",
    fileName: req.file.originalname,
    filePath: `storage/study-materials/${req.file.filename}`,
    mimeType: req.file.mimetype || "application/octet-stream",
    fileSize: req.file.size || 0,
    uploadedBy: req.user.userId,
    institutionId: req.user.institutionId,
    departmentId: req.user.departmentId || null,
  });

  res.status(201).json({ material });
}

export async function listStudyMaterials(req, res) {
  const role = req.user.role;
  const filter = { institutionId: req.user.institutionId, isActive: true };

  if (role === "student") {
    filter.$or = [{ audience: "all" }, { audience: "students" }];
  }

  const materials = await StudyMaterial.find(filter).sort({ category: 1, createdAt: -1 });
  res.json({ materials });
}

export async function deleteStudyMaterial(req, res) {
  const material = await StudyMaterial.findById(req.params.id);
  if (!material) return res.status(404).json({ error: "Study material not found" });

  const fullPath = path.join(__dirname, "../../", material.filePath);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

  material.isActive = false;
  await material.save();
  res.json({ message: "Study material removed" });
}

// ---------- Admin: user management ----------

// GET /api/admin/users
export async function listUsers(req, res) {
  const { role, departmentId } = req.query;
  const filter = { institutionId: req.user.institutionId };
  if (role) filter.role = role;
  if (departmentId) filter.departmentId = departmentId;
  const users = await User.find(filter).select("-passwordHash -totpSecret -refreshTokenHash");
  res.json({ users });
}

// POST /api/admin/users
export async function createUser(req, res) {
  const body = req.body;
  if (!body.userId || !body.role || !body.name || !body.email || !body.password) {
    return res.status(400).json({ error: "userId, role, name, email, password are required" });
  }
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await User.create({
    ...body,
    passwordHash,
    institutionId: body.institutionId || req.user.institutionId,
  });
  res.status(201).json({ user: { ...user.toObject(), passwordHash: undefined } });
}

// PATCH /api/admin/users/:id
export async function editUser(req, res) {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { password, ...rest } = req.body;
  Object.assign(user, rest);
  if (password) user.passwordHash = await bcrypt.hash(password, 12);
  await user.save();

  res.json({ message: "User updated" });
}

// POST /api/admin/users/bulk-import  (CSV: name, ID, department, semester, section)
export async function bulkImportUsers(req, res) {
  // TODO: wire up multer + csv-parse to accept an uploaded file and stream
  // rows into User.insertMany with default passwords sent by email.
  res.status(501).json({
    message:
      "Bulk import endpoint scaffolded but not implemented. Add a multer upload handler + CSV parser here.",
  });
}

// GET /api/admin/dashboard
export async function getAdminDashboard(req, res) {
  const departmentId = req.user.departmentId;
  const institutionId = req.user.institutionId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalStudents, totalFaculty,
    pendingCertificates, pendingGrievances,
    todaysAttendance,
  ] = await Promise.all([
    User.countDocuments({ role: "student", institutionId }),
    User.countDocuments({ role: "faculty", institutionId }),
    CertificateRequest.countDocuments({ status: "pending" }),
    Grievance.countDocuments({ departmentId, status: { $in: ["Open", "In Review"] } }),
    AttendanceRecord.find({ date: { $gte: today } }),
  ]);

  const courses = await Course.find({ departmentId });
  const assessmentsPending = await Assessment.countDocuments({
    courseId: { $in: courses.map((c) => c.courseId) },
    marksPublished: false,
  });

  const records = await AttendanceRecord.find({ status: { $ne: "holiday" } });
  const deptStudents = await User.find({ role: "student", departmentId });
  const studentIds = new Set(deptStudents.map((s) => s.userId));

  const perStudent = {};
  for (const r of records) {
    if (!studentIds.has(r.studentId)) continue;
    if (!perStudent[r.studentId]) perStudent[r.studentId] = { total: 0, attended: 0 };
    perStudent[r.studentId].total += 1;
    if (["present", "od", "late"].includes(r.status)) perStudent[r.studentId].attended += 1;
  }
  const percentages = Object.values(perStudent).map((s) => (s.total ? (s.attended / s.total) * 100 : 0));
  const avgAttendance = percentages.length ? percentages.reduce((a, b) => a + b, 0) / percentages.length : 0;
  const chronicAbsentees = Object.entries(perStudent).filter(([, s]) => s.total && s.attended / s.total < 0.65).length;

  // Recent grievances
  const recentGrievances = await Grievance.find({ departmentId }).sort({ createdAt: -1 }).limit(5);
  // Recent certificate requests
  const recentCertRequests = await CertificateRequest.find().sort({ createdAt: -1 }).limit(5);

  res.json({
    totalStudents,
    totalFaculty,
    departmentAverageAttendanceToday: Math.round(avgAttendance * 10) / 10,
    chronicAbsenteeCount: chronicAbsentees,
    pendingCertificates,
    pendingGrievances,
    resultsPendingCount: assessmentsPending,
    todaysClassesMarked: todaysAttendance.length,
    recentGrievances,
    recentCertRequests,
  });
}

// GET /api/admin/users/:userId  — full student profile for admin view
export async function getStudentProfile(req, res) {
  const { userId } = req.params;
  const student = await User.findOne({ userId }).select("-passwordHash -totpSecret -refreshTokenHash");
  if (!student) return res.status(404).json({ error: "Student not found" });

  const records = await AttendanceRecord.find({ studentId: userId, status: { $ne: "holiday" } });
  const perCourse = {};
  for (const r of records) {
    if (!perCourse[r.courseId]) perCourse[r.courseId] = { total: 0, attended: 0 };
    perCourse[r.courseId].total += 1;
    if (["present", "od", "late"].includes(r.status)) perCourse[r.courseId].attended += 1;
  }
  const courses = await Course.find({ courseId: { $in: Object.keys(perCourse) } });
  const courseNameMap = Object.fromEntries(courses.map((c) => [c.courseId, c.name]));
  const attendance = Object.entries(perCourse).map(([courseId, { total, attended }]) => ({
    courseId, courseName: courseNameMap[courseId] || courseId, total, attended,
    percentage: total ? Math.round((attended / total) * 1000) / 10 : 0,
  }));
  const overallTotal = attendance.reduce((s, c) => s + c.total, 0);
  const overallAttended = attendance.reduce((s, c) => s + c.attended, 0);

  const marks = await Marks.find({ studentId: userId }).populate("assessmentId");
  const xpEvents = await XpLedger.find({ studentId: userId });
  const totalXp = xpEvents.reduce((s, e) => s + e.points, 0);

  const byDate = {};
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(r.status);
  }
  let streak = 0;
  for (const day of Object.keys(byDate).sort().reverse()) {
    if (byDate[day].includes("absent")) break;
    streak += 1;
  }

  res.json({
    student,
    attendance: { subjects: attendance, overallPercentage: overallTotal ? Math.round((overallAttended / overallTotal) * 1000) / 10 : 0 },
    marks,
    xp: { totalXp, streak },
  });
}

// ---------- Admin: departments ----------

// GET /api/admin/departments
export async function listDepartments(req, res) {
  const { Department } = await import("../models/index.js");
  const departments = await Department.find({ institutionId: req.user.institutionId });
  res.json({ departments });
}

// POST /api/admin/departments
export async function createDepartment(req, res) {
  const { Department } = await import("../models/index.js");
  const { departmentId, name, code, hodId } = req.body;
  if (!departmentId || !name || !code) return res.status(400).json({ error: "departmentId, name, code required" });
  const dept = await Department.create({ departmentId, name, code, hodId, institutionId: req.user.institutionId });
  res.status(201).json({ department: dept });
}

// PATCH /api/admin/departments/:id
export async function updateDepartment(req, res) {
  const { Department } = await import("../models/index.js");
  const dept = await Department.findById(req.params.id);
  if (!dept) return res.status(404).json({ error: "Department not found" });
  Object.assign(dept, req.body);
  await dept.save();
  res.json({ department: dept });
}

// ---------- Admin: courses ----------

// GET /api/admin/courses
export async function listCourses(req, res) {
  const filter = { institutionId: req.user.institutionId };
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  const courses = await Course.find(filter).sort({ departmentId: 1, semester: 1 });
  res.json({ courses });
}

// POST /api/admin/courses
export async function createCourse(req, res) {
  const { courseId, name, departmentId, semester, section, facultyId, academicYear } = req.body;
  if (!courseId || !name || !departmentId || !semester || !facultyId) {
    return res.status(400).json({ error: "courseId, name, departmentId, semester, facultyId required" });
  }
  const course = await Course.create({
    courseId, name, departmentId, semester,
    section: section || "A",
    facultyId,
    academicYear: academicYear || "2024-2025",
    institutionId: req.user.institutionId,
  });
  res.status(201).json({ course });
}

// PATCH /api/admin/courses/:id
export async function updateCourse(req, res) {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ error: "Course not found" });
  Object.assign(course, req.body);
  await course.save();
  res.json({ course });
}

// DELETE /api/admin/courses/:id
export async function deleteCourse(req, res) {
  await Course.findByIdAndDelete(req.params.id);
  res.json({ message: "Course deleted" });
}

// ---------- Admin: announcements ----------

// GET /api/admin/announcements
export async function listAnnouncements(req, res) {
  const announcements = await Announcement.find({ institutionId: req.user.institutionId })
    .sort({ createdAt: -1 });
  res.json({ announcements });
}

// POST /api/admin/announcements
export async function createAnnouncement(req, res) {
  const { title, body, audience } = req.body;
  if (!title || !body) return res.status(400).json({ error: "title and body required" });

  const ann = await Announcement.create({
    title,
    body,
    audience: audience || "all",
    createdBy: req.user.userId,
    institutionId: req.user.institutionId,
  });

  // Push in-app notification to all relevant users
  const roleFilter = audience === "students" ? "student" : audience === "faculty" ? "faculty" : null;
  const userFilter = { institutionId: req.user.institutionId };
  if (roleFilter) userFilter.role = roleFilter;
  const users = await User.find(userFilter).select("userId role");
  const { pushNotification } = await import("../utils/notify.js");
  await Promise.all(
    users.map((u) =>
      pushNotification({
        userId: u.userId,
        type: "announcement",
        priority: "medium",
        title,
        message: body,
        linkTo: u.role === "student" ? "/student/dashboard" : "/admin/announcements",
      })
    )
  );

  res.status(201).json({ announcement: ann });
}

// DELETE /api/admin/announcements/:id
export async function deleteAnnouncement(req, res) {
  await Announcement.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
}

// GET /api/announcements — student/faculty-facing
export async function listStudentAnnouncements(req, res) {
  const role = req.user.role;
  const announcements = await Announcement.find({
    institutionId: req.user.institutionId,
    $or: [
      { audience: "all" },
      { audience: role === "student" ? "students" : "faculty" },
    ],
  }).sort({ createdAt: -1 });
  res.json({ announcements });
}

// ---------- Admin: reports ----------

// GET /api/admin/reports/attendance  — per-student attendance summary for dept
export async function getAttendanceReport(req, res) {
  const { AttendanceRecord, Enrollment } = await import("../models/index.js");
  const departmentId = req.query.departmentId || req.user.departmentId;
  const students = await User.find({ role: "student", departmentId }).select("userId name enrollmentNumber semester section");
  const studentIds = students.map((s) => s.userId);
  const records = await AttendanceRecord.find({ studentId: { $in: studentIds }, status: { $ne: "holiday" } });

  const perStudent = {};
  for (const r of records) {
    if (!perStudent[r.studentId]) perStudent[r.studentId] = { total: 0, attended: 0 };
    perStudent[r.studentId].total += 1;
    if (["present", "od", "late"].includes(r.status)) perStudent[r.studentId].attended += 1;
  }

  const report = students.map((s) => {
    const d = perStudent[s.userId] || { total: 0, attended: 0 };
    return {
      studentId: s.userId,
      name: s.name,
      enrollmentNumber: s.enrollmentNumber,
      semester: s.semester,
      section: s.section,
      total: d.total,
      attended: d.attended,
      percentage: d.total ? Math.round((d.attended / d.total) * 1000) / 10 : 0,
      status: d.total === 0 ? "no-data" : d.attended / d.total < 0.65 ? "chronic" : d.attended / d.total < 0.75 ? "danger" : d.attended / d.total < 0.85 ? "warning" : "good",
    };
  }).sort((a, b) => a.percentage - b.percentage);

  res.json({ report, departmentId });
}

// GET /api/admin/reports/marks  — per-course average marks
export async function getMarksReport(req, res) {
  const { Assessment, Marks } = await import("../models/index.js");
  const departmentId = req.query.departmentId || req.user.departmentId;
  const courses = await Course.find({ departmentId });
  const report = await Promise.all(
    courses.map(async (c) => {
      const assessments = await Assessment.find({ courseId: c.courseId, marksPublished: true });
      const assessmentData = await Promise.all(
        assessments.map(async (a) => {
          const marks = await Marks.find({ assessmentId: a._id, isAbsent: false, marksObtained: { $ne: null } });
          const values = marks.map((m) => m.marksObtained);
          const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
          return { type: a.type, title: a.title, maxMarks: a.maxMarks, avg: Math.round(avg * 10) / 10, count: values.length };
        })
      );
      return { courseId: c.courseId, courseName: c.name, assessments: assessmentData };
    })
  );
  res.json({ report });
}

// ---------- Gamification ----------

// GET /api/gamification/leaderboard
export async function getLeaderboard(req, res) {
  const institutionId = req.user.institutionId;
  const students = await User.find({ role: "student", institutionId }).select("userId name");
  const studentIds = students.map((s) => s.userId);

  const ledger = await XpLedger.aggregate([
    { $match: { studentId: { $in: studentIds } } },
    { $group: { _id: "$studentId", totalXp: { $sum: "$points" } } },
    { $sort: { totalXp: -1 } },
    { $limit: 20 },
  ]);

  const nameMap = Object.fromEntries(students.map((s) => [s.userId, s.name]));
  const leaderboard = ledger.map((e) => ({
    studentId: e._id,
    name: nameMap[e._id] || e._id,
    totalXp: e.totalXp,
  }));

  res.json({ leaderboard });
}

// GET /api/gamification/xp/:studentId
export async function getStudentXp(req, res) {
  const { studentId } = req.params;
  const events = await XpLedger.find({ studentId }).sort({ createdAt: -1 });
  const totalXp = events.reduce((sum, e) => sum + e.points, 0);

  // Attendance streak: consecutive most-recent days with full attendance,
  // resetting on the first "absent" (OD does not break the streak — PRD 3.4).
  const records = await AttendanceRecord.find({ studentId, status: { $ne: "holiday" } }).sort({ date: -1 });
  const byDate = {};
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(r.status);
  }
  let streak = 0;
  for (const day of Object.keys(byDate).sort().reverse()) {
    const statuses = byDate[day];
    if (statuses.includes("absent")) break;
    streak += 1;
  }

  res.json({ studentId, totalXp, streak, events: events.slice(0, 20) });
}
