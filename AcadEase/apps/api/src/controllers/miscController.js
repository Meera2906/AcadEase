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
  const { phone, newPassword, name, enrollmentNumber } = req.body;
  const user = await User.findOne({ userId: req.user.userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  // Only allow students to edit name / enrollmentNumber
  if (name) user.name = name.trim();
  if (phone !== undefined) user.phone = phone.trim();
  if (enrollmentNumber !== undefined && user.role === "student") user.enrollmentNumber = enrollmentNumber.trim();
  if (newPassword) user.passwordHash = await bcrypt.hash(newPassword, 12);
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pendingCertificates, pendingGrievances, todaysAttendance] = await Promise.all([
    CertificateRequest.countDocuments({ status: "pending" }),
    Grievance.countDocuments({ departmentId, status: { $in: ["Open", "In Review"] } }),
    AttendanceRecord.find({ date: today }),
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

  res.json({
    departmentAverageAttendanceToday: Math.round(avgAttendance * 10) / 10,
    chronicAbsenteeCount: chronicAbsentees,
    pendingCertificates,
    pendingGrievances,
    resultsPendingCount: assessmentsPending,
    todaysClassesMarked: todaysAttendance.length,
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
