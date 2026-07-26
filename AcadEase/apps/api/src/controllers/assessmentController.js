import { Assessment, Marks, Enrollment, User } from "../models/index.js";
import { pushNotification } from "../utils/notify.js";

// GET /api/assessments/course/:courseId
export async function listAssessments(req, res) {
  const { courseId } = req.params;
  const assessments = await Assessment.find({ courseId }).sort({ createdAt: -1 });
  res.json({ assessments });
}

// POST /api/assessments
export async function createAssessment(req, res) {
  const { courseId, type, title, maxMarks, dueDate } = req.body;
  if (!courseId || !type || !title || !maxMarks) {
    return res.status(400).json({ error: "courseId, type, title, and maxMarks are required" });
  }
  const assessment = await Assessment.create({
    courseId,
    type,
    title,
    maxMarks,
    dueDate,
    createdBy: req.user.userId,
  });
  res.status(201).json({ assessment });
}

// GET /api/assessments — list all assessments (admin)
export async function listAllAssessments(req, res) {
  const assessments = await Assessment.find().sort({ createdAt: -1 });
  res.json({ assessments });
}

// PATCH /api/assessments/:id/publish — toggle marks published (admin/superadmin)
export async function togglePublishMarks(req, res) {
  const { id } = req.params;
  const { marksPublished } = req.body;
  const assessment = await Assessment.findById(id);
  if (!assessment) return res.status(404).json({ error: "Assessment not found" });
  assessment.marksPublished = marksPublished !== undefined ? marksPublished : !assessment.marksPublished;
  await assessment.save();
  res.json({ assessment });
}

// PATCH /api/assessments/:id
export async function updateAssessment(req, res) {
  const { id } = req.params;
  const assessment = await Assessment.findById(id);
  if (!assessment) return res.status(404).json({ error: "Assessment not found" });
  if (assessment.marksPublished) {
    return res.status(409).json({ error: "Cannot edit an assessment after marks are published" });
  }
  Object.assign(assessment, req.body);
  await assessment.save();
  res.json({ assessment });
}

// POST /api/marks/:assessmentId  body: { entries: [{ studentId, marksObtained, isAbsent }] }
export async function submitMarks(req, res) {
  const { assessmentId } = req.params;
  const { entries } = req.body;

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) return res.status(404).json({ error: "Assessment not found" });

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: "entries[] is required" });
  }

  for (const entry of entries) {
    if (entry.marksObtained != null) {
      if (entry.marksObtained < 0 || entry.marksObtained > assessment.maxMarks) {
        return res.status(400).json({
          error: `Marks for ${entry.studentId} must be between 0 and ${assessment.maxMarks}`,
        });
      }
    }
  }

  const results = [];
  for (const entry of entries) {
    const doc = await Marks.findOneAndUpdate(
      { assessmentId, studentId: entry.studentId },
      {
        $set: {
          courseId: assessment.courseId,
          marksObtained: entry.isAbsent ? null : entry.marksObtained,
          isAbsent: !!entry.isAbsent,
          submittedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(doc);
  }

  assessment.marksPublished = true;
  await assessment.save();

  await Promise.all(
    entries.map((e) =>
      pushNotification({
        userId: e.studentId,
        type: "marks_published",
        priority: "high",
        title: `Marks published: ${assessment.title}`,
        message: `Your marks for ${assessment.title} (${assessment.courseId}) are now available.`,
        linkTo: "/student/results",
      })
    )
  );

  res.status(201).json({ message: "Marks published", marks: results });
}

// PATCH /api/marks/:assessmentId/:studentId
export async function editSingleMark(req, res) {
  const { assessmentId, studentId } = req.params;
  const { marksObtained, isAbsent } = req.body;

  const mark = await Marks.findOne({ assessmentId, studentId });
  if (!mark) return res.status(404).json({ error: "Mark record not found" });

  const hoursSinceSubmit = mark.submittedAt ? (Date.now() - mark.submittedAt.getTime()) / 3600000 : Infinity;
  if (req.user.role === "faculty" && hoursSinceSubmit > 48) {
    return res.status(403).json({ error: "Edit window (48h) has passed. Ask an admin to correct this mark." });
  }

  if (marksObtained !== undefined) mark.marksObtained = marksObtained;
  if (isAbsent !== undefined) mark.isAbsent = isAbsent;
  mark.editedAt = new Date();
  mark.editedBy = req.user.userId;
  await mark.save();

  res.json({ mark });
}

// GET /api/assessments/mine  — assessments for the logged-in student's enrolled courses
export async function getMyAssessments(req, res) {
  const { Enrollment } = await import("../models/index.js");
  const enrollments = await Enrollment.find({ studentId: req.user.userId });
  const courseIds = enrollments.map((e) => e.courseId);
  const assessments = await Assessment.find({ courseId: { $in: courseIds } }).sort({ createdAt: -1 });
  res.json({ assessments });
}

// GET /api/marks/student/:studentId
export async function getStudentMarks(req, res) {
  const { studentId } = req.params;
  const marks = await Marks.find({ studentId }).populate("assessmentId").sort({ createdAt: -1 });
  res.json({ marks });
}

// GET /api/marks/assessment/:assessmentId/leaderboard
export async function getLeaderboard(req, res) {
  const { assessmentId } = req.params;
  const marks = await Marks.find({ assessmentId, isAbsent: false, marksObtained: { $ne: null } }).sort({
    marksObtained: -1,
  });

  const studentIds = marks.map((m) => m.studentId);
  const students = await User.find({ userId: { $in: studentIds } });
  const nameMap = Object.fromEntries(students.map((s) => [s.userId, s.name]));

  const ranked = marks.map((m, i) => ({
    rank: i + 1,
    studentId: m.studentId,
    displayName: m.optedOutOfLeaderboard ? "Anonymous" : nameMap[m.studentId] || m.studentId,
    marksObtained: m.marksObtained,
  }));

  res.json({ assessmentId, leaderboard: ranked.slice(0, 10), fullRanking: ranked });
}

// GET /api/marks/assessment/:assessmentId/students  — enrolled students with existing marks
export async function getAssessmentStudents(req, res) {
  const { assessmentId } = req.params;
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) return res.status(404).json({ error: "Assessment not found" });

  const enrollments = await Enrollment.find({ courseId: assessment.courseId, isActive: true });
  const studentIds = enrollments.map((e) => e.studentId);
  const students = await User.find({ userId: { $in: studentIds } })
    .select("userId name enrollmentNumber resumePath")
    .sort({ name: 1 });

  const existingMarks = await Marks.find({ assessmentId });
  const marksMap = Object.fromEntries(existingMarks.map((m) => [m.studentId, m]));

  const rows = students.map((s) => ({
    studentId: s.userId,
    name: s.name,
    enrollmentNumber: s.enrollmentNumber || s.userId,
    resumePath: s.resumePath || null,
    marksObtained: marksMap[s.userId]?.marksObtained ?? "",
    isAbsent: marksMap[s.userId]?.isAbsent ?? false,
  }));

  res.json({ rows, maxMarks: assessment.maxMarks });
}

// GET /api/marks/course/:courseId/summary
export async function getCourseMarksSummary(req, res) {
  const { courseId } = req.params;
  const assessments = await Assessment.find({ courseId });

  const summary = [];
  for (const a of assessments) {
    const marks = await Marks.find({ assessmentId: a._id, isAbsent: false, marksObtained: { $ne: null } });
    const values = marks.map((m) => m.marksObtained).sort((x, y) => x - y);
    const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    const median = values.length ? values[Math.floor(values.length / 2)] : 0;
    summary.push({
      assessmentId: a._id,
      title: a.title,
      maxMarks: a.maxMarks,
      average: Math.round(avg * 10) / 10,
      highest: values[values.length - 1] || 0,
      lowest: values[0] || 0,
      median,
      submissionCount: values.length,
    });
  }

  res.json({ courseId, summary });
}
