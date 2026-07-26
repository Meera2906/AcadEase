import { AttendanceRecord, ODRequest, Course, Enrollment } from "../models/index.js";
import { notifyAbsent, pushNotification } from "../utils/notify.js";

// GET /api/attendance/student/:studentId
export async function getStudentAttendance(req, res) {
  const { studentId } = req.params;
  const records = await AttendanceRecord.find({ studentId }).sort({ date: -1 });

  const byCourse = {};
  for (const r of records) {
    if (!byCourse[r.courseId]) byCourse[r.courseId] = [];
    byCourse[r.courseId].push(r);
  }
  res.json({ studentId, byCourse });
}

// GET /api/attendance/student/:studentId/summary
export async function getStudentSummary(req, res) {
  const { studentId } = req.params;
  const records = await AttendanceRecord.find({ studentId });

  const perCourse = {};
  for (const r of records) {
    if (!perCourse[r.courseId]) perCourse[r.courseId] = { total: 0, attended: 0 };
    if (r.status === "holiday") continue;
    perCourse[r.courseId].total += 1;
    if (r.status === "present" || r.status === "od" || r.status === "late") {
      perCourse[r.courseId].attended += 1;
    }
  }

  const courses = await Course.find({ courseId: { $in: Object.keys(perCourse) } });
  const courseNameMap = Object.fromEntries(courses.map((c) => [c.courseId, c.name]));

  const summary = Object.entries(perCourse).map(([courseId, { total, attended }]) => ({
    courseId,
    courseName: courseNameMap[courseId] || courseId,
    total,
    attended,
    percentage: total ? Math.round((attended / total) * 1000) / 10 : 0,
  }));

  const overallTotal = summary.reduce((s, c) => s + c.total, 0);
  const overallAttended = summary.reduce((s, c) => s + c.attended, 0);
  const overallPercentage = overallTotal ? Math.round((overallAttended / overallTotal) * 1000) / 10 : 0;

  res.json({ studentId, overallPercentage, subjects: summary });
}

// GET /api/attendance/course/:courseId/date/:date
export async function getCourseAttendanceSheet(req, res) {
  const { courseId, date } = req.params;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const enrollments = await Enrollment.find({ courseId, isActive: true });
  const existing = await AttendanceRecord.find({ courseId, date: { $gte: dayStart, $lte: dayEnd } });
  const existingMap = Object.fromEntries(existing.map((r) => [r.studentId, r]));

  const sheet = enrollments.map((e) => ({
    studentId: e.studentId,
    status: existingMap[e.studentId]?.status || null,
    note: existingMap[e.studentId]?.note || "",
  }));

  res.json({ courseId, date, sheet, alreadySubmitted: existing.length > 0 });
}

// POST /api/attendance/mark
// body: { courseId, date, sessionTime, records: [{ studentId, status, note }] }
// This is the centrepiece flow from PRD 5.2.2: write attendance, then fire
// an absent notification for every student marked "absent" (not od/late).
export async function markAttendance(req, res) {
  const facultyId = req.user.userId;
  const { courseId, date, sessionTime = "09:00", records } = req.body;

  if (!courseId || !date || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: "courseId, date, and records[] are required" });
  }

  const course = await Course.findOne({ courseId });
  if (!course) return res.status(404).json({ error: "Course not found" });

  const results = [];
  const absentStudents = [];

  for (const rec of records) {
    const doc = await AttendanceRecord.findOneAndUpdate(
      { courseId, studentId: rec.studentId, date: new Date(date) },
      {
        $set: {
          facultyId,
          sessionTime,
          status: rec.status,
          note: rec.note || "",
          markedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(doc);
    if (rec.status === "absent") absentStudents.push(rec.studentId);
  }

  // Fire-and-forget notification pipeline — decoupled per PRD 10.1, but
  // awaited here since this is a single-process MVP with no queue worker.
  await Promise.all(
    absentStudents.map((studentId) =>
      notifyAbsent({
        studentId,
        courseName: course.name,
        sessionTime,
        courseId,
        date,
      })
    )
  );

  res.status(201).json({
    message: `Attendance recorded for ${results.length} student(s). ${absentStudents.length} absent notification(s) queued.`,
    records: results,
    absentCount: absentStudents.length,
  });
}

// PATCH /api/attendance/:recordId
export async function editAttendanceRecord(req, res) {
  const { recordId } = req.params;
  const { status, note } = req.body;
  const editor = req.user;

  const record = await AttendanceRecord.findById(recordId);
  if (!record) return res.status(404).json({ error: "Attendance record not found" });

  // Faculty can edit within 24h of marking; after that, only admin (PRD 5.2.1)
  const hoursSinceMarked = (Date.now() - new Date(record.markedAt).getTime()) / 3600000;
  if (editor.role === "faculty" && hoursSinceMarked > 24) {
    return res.status(403).json({ error: "Edit window (24h) has passed. Ask an admin to correct this record." });
  }

  if (status) record.status = status;
  if (note !== undefined) record.note = note;
  record.editedAt = new Date();
  record.editedBy = editor.userId;
  await record.save();

  res.json({ message: "Attendance record updated", record });
}

// GET /api/attendance/course/:courseId/analytics
export async function getCourseAnalytics(req, res) {
  const { courseId } = req.params;
  const records = await AttendanceRecord.find({ courseId, status: { $ne: "holiday" } });

  const perStudent = {};
  for (const r of records) {
    if (!perStudent[r.studentId]) perStudent[r.studentId] = { total: 0, attended: 0 };
    perStudent[r.studentId].total += 1;
    if (["present", "od", "late"].includes(r.status)) perStudent[r.studentId].attended += 1;
  }

  const defaulters = Object.entries(perStudent)
    .map(([studentId, { total, attended }]) => ({
      studentId,
      percentage: total ? Math.round((attended / total) * 1000) / 10 : 0,
    }))
    .filter((s) => s.percentage < 75)
    .sort((a, b) => a.percentage - b.percentage);

  const chronicAbsentees = defaulters.filter((s) => s.percentage < 65);

  res.json({ courseId, defaulters, chronicAbsentees, studentCount: Object.keys(perStudent).length });
}

// POST /api/attendance/od-request
export async function submitOdRequest(req, res) {
  const studentId = req.user.userId;
  const { courseId, facultyId, attendanceRecordId, date, reasonType, reasonDetails, supportingDocPath } = req.body;

  if (!courseId || !date || !reasonType) {
    return res.status(400).json({ error: "courseId, date, and reasonType are required" });
  }

  const odRequest = await ODRequest.create({
    studentId,
    courseId,
    facultyId,
    attendanceRecordId,
    date,
    reasonType,
    reasonDetails,
    supportingDocPath,
  });

  res.status(201).json({ message: "OD request submitted", odRequest });
}

// GET /api/attendance/od-requests  (faculty — pending for their courses)
export async function getPendingOdRequests(req, res) {
  const facultyId = req.user.userId;
  const requests = await ODRequest.find({ facultyId, status: "pending" }).sort({ createdAt: -1 });
  res.json({ requests });
}

// GET /api/attendance/od-requests/student/:studentId
export async function getStudentOdRequests(req, res) {
  const { studentId } = req.params;
  const requests = await ODRequest.find({ studentId }).sort({ createdAt: -1 });
  res.json({ requests });
}

// PATCH /api/attendance/od-request/:id
export async function reviewOdRequest(req, res) {
  const { id } = req.params;
  const { decision, facultyNote } = req.body; // decision: "approved" | "rejected"

  const odRequest = await ODRequest.findById(id);
  if (!odRequest) return res.status(404).json({ error: "OD request not found" });

  odRequest.status = decision;
  odRequest.facultyNote = facultyNote || "";
  odRequest.reviewedAt = new Date();
  await odRequest.save();

  if (decision === "approved") {
    await AttendanceRecord.findOneAndUpdate(
      { courseId: odRequest.courseId, studentId: odRequest.studentId, date: odRequest.date },
      { status: "od", odRequestId: odRequest._id, editedAt: new Date(), editedBy: req.user.userId }
    );
  }

  await pushNotification({
    userId: odRequest.studentId,
    type: "od_status",
    priority: "high",
    title: `OD request ${decision}`,
    message:
      decision === "approved"
        ? `Your OD request for ${odRequest.courseId} on ${new Date(odRequest.date).toDateString()} was approved.`
        : `Your OD request for ${odRequest.courseId} was rejected. ${facultyNote || ""}`,
    linkTo: "/student/attendance",
  });

  res.json({ message: `OD request ${decision}`, odRequest });
}
