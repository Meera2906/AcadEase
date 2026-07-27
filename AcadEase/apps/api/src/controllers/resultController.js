import fs from "fs";
import path from "path";
import multer from "multer";
import twilio from "twilio";
import { Result, Marks, Assessment, Course, User, Enrollment } from "../models/index.js";
import { generateResultPdf } from "../utils/resultPdf.js";
import { sendEmail, pushNotification } from "../utils/notify.js";

const RESULTS_DIR = path.resolve("storage", "results");
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

export const resultPdfUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, RESULTS_DIR),
    filename: (_, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
  }),
  fileFilter: (_, file, cb) => cb(null, file.mimetype === "application/pdf"),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Normalise a phone number to E.164 — assumes Indian numbers if no country code
function toE164(phone) {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return `+${digits}`;
  // Indian 10-digit mobile
  if (digits.length === 10) return `+91${digits}`;
  // Already has country code without +
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}

async function sendSms(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    console.warn("[sms] Twilio env vars not set — skipping SMS");
    return;
  }
  const toFormatted = toE164(to);
  console.log(`[sms] sending to ${toFormatted} from ${from}`);
  try {
    const client = twilio(sid, token);
    const msg = await client.messages.create({ from, to: toFormatted, body });
    console.log(`[sms] sent — SID: ${msg.sid}`);
  } catch (err) {
    console.error("[sms] failed:", err.message, err.code || "");
  }
}

// POST /api/results/semester
export async function enterSemesterResult(req, res) {
  const { studentId, semester, academicYear, subjects } = req.body;
  if (!studentId || !semester || !academicYear || !Array.isArray(subjects)) {
    return res.status(400).json({ error: "studentId, semester, academicYear, subjects[] are required" });
  }

  const result = await Result.findOneAndUpdate(
    { studentId, semester, academicYear },
    { $set: { subjects, enteredBy: req.user.userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ result });
}

// POST /api/results/semester/:studentId/submit-review  — faculty submits for admin review
export async function submitResultForReview(req, res) {
  const { studentId } = req.params;
  const { semester, academicYear } = req.body;
  if (!semester || !academicYear) return res.status(400).json({ error: "semester and academicYear required" });

  const result = await Result.findOneAndUpdate(
    { studentId, semester: Number(semester), academicYear },
    { $set: { status: "pending_review", rejectionNote: null, rejectedBy: null } },
    { new: true }
  );
  if (!result) return res.status(404).json({ error: "Result not found. Enter marks first." });

  // Notify all admins in the same department
  const faculty = await User.findOne({ userId: req.user.userId }).select("departmentId");
  const admins = await User.find({ role: { $in: ["admin", "superadmin"] }, departmentId: faculty?.departmentId }).select("userId");
  await Promise.all(admins.map((a) =>
    pushNotification({
      userId: a.userId,
      type: "result_review",
      priority: "high",
      title: "Result Pending Review",
      message: `Faculty submitted Semester ${semester} (${academicYear}) result for ${studentId} — awaiting your approval.`,
      linkTo: "/admin/marks",
    })
  ));

  res.json({ message: "Submitted for review.", result });
}

// POST /api/results/semester/:studentId/reject  — admin rejects and sends back to faculty
export async function rejectResult(req, res) {
  const { studentId } = req.params;
  const { semester, academicYear, rejectionNote } = req.body;
  if (!semester || !academicYear) return res.status(400).json({ error: "semester and academicYear required" });
  if (!rejectionNote?.trim()) return res.status(400).json({ error: "rejectionNote is required" });

  const result = await Result.findOneAndUpdate(
    { studentId, semester: Number(semester), academicYear },
    { $set: { status: "rejected", rejectionNote: rejectionNote.trim(), rejectedBy: req.user.userId } },
    { new: true }
  );
  if (!result) return res.status(404).json({ error: "Result not found" });

  // Notify the faculty who entered the result
  await pushNotification({
    userId: result.enteredBy,
    type: "result_rejected",
    priority: "high",
    title: "Result Rejected — Correction Required",
    message: `Semester ${semester} (${academicYear}) result for ${studentId} was rejected. Reason: ${rejectionNote.trim()}`,
    linkTo: "/faculty/results",
  });

  res.json({ message: "Result rejected and faculty notified.", result });
}

// GET /api/results/pending-review  — admin: list all results pending review or rejected
export async function listPendingResults(req, res) {
  const results = await Result.find({ status: { $in: ["pending_review", "rejected"] } })
    .sort({ updatedAt: -1 })
    .select("studentId semester academicYear status rejectionNote rejectedBy enteredBy updatedAt");
  res.json({ results });
}

// POST /api/results/semester/:studentId/publish
export async function publishSemesterResult(req, res) {
  const { studentId } = req.params;
  const { semester, academicYear } = req.body;
  if (!semester || !academicYear) return res.status(400).json({ error: "semester and academicYear required" });

  // 1. Find all active enrollments for this student for the academic year
  const enrollments = await Enrollment.find({ studentId, academicYear, isActive: true });
  const enrolledCourseIds = enrollments.map((e) => e.courseId);

  // 2. Filter courses to the ones in this semester
  const courses = await Course.find({ courseId: { $in: enrolledCourseIds }, semester: Number(semester) });
  if (courses.length === 0) {
    return res.status(404).json({ error: `No courses found for student ${studentId} in Semester ${semester} (${academicYear})` });
  }

  // 3. For each course, aggregate marks and calculate grade
  const subjects = [];
  for (const course of courses) {
    // Find all assessments for this course where marks are published
    const assessments = await Assessment.find({ courseId: course.courseId, marksPublished: true });
    if (assessments.length === 0) {
      subjects.push({
        courseId: course.courseId,
        courseName: course.name,
        grade: "U",
        marksObtained: 0,
        maxMarks: 100,
        result: "fail",
      });
      continue;
    }

    const assessmentIds = assessments.map((a) => a._id);
    const marks = await Marks.find({ studentId, assessmentId: { $in: assessmentIds } });

    let totalObtained = 0;
    let totalMax = 0;
    let hasMarks = false;

    for (const a of assessments) {
      const m = marks.find((m) => m.assessmentId.toString() === a._id.toString());
      if (m) {
        hasMarks = true;
        if (!m.isAbsent && m.marksObtained != null) {
          totalObtained += m.marksObtained;
        }
        totalMax += a.maxMarks;
      }
    }

    const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    const finalScore = Math.round(percentage);

    // Assign grades based on percentage
    let grade = "U";
    if (hasMarks) {
      if (percentage >= 90) grade = "O";
      else if (percentage >= 80) grade = "A+";
      else if (percentage >= 70) grade = "A";
      else if (percentage >= 60) grade = "B+";
      else if (percentage >= 50) grade = "B";
      else if (percentage >= 45) grade = "C";
    }

    subjects.push({
      courseId: course.courseId,
      courseName: course.name,
      grade,
      marksObtained: finalScore,
      maxMarks: 100,
      result: grade === "U" ? "fail" : "pass",
    });
  }

  const result = await Result.findOneAndUpdate(
    { studentId, semester: Number(semester), academicYear },
    { $set: { subjects, enteredBy: req.user.userId, releasedAt: new Date(), status: "published" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const student = await User.findOne({ userId: studentId }).select(
    "name email phone parentPhone userId enrollmentNumber department departmentId"
  );
  if (!student) return res.status(404).json({ error: "Student not found" });

  const { storagePath } = await generateResultPdf({ student, result });
  await Result.findByIdAndUpdate(result._id, { pdfPath: storagePath });

  const apiBase = process.env.API_URL || "http://localhost:5000";
  const pdfUrl = `${apiBase}/${storagePath}`;

  await pushNotification({
    userId: studentId,
    type: "result_published",
    priority: "high",
    title: "Semester Result Published",
    message: `Your Semester ${semester} (${academicYear}) result is now available.`,
    linkTo: "/student/results",
  });

  if (student.email) {
    await sendEmail({
      to: student.email,
      subject: `Semester ${semester} Result — ${academicYear}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px"><h2 style="color:#1a1a2e">Semester Result Published</h2><p>Hi <strong>${student.name}</strong>,</p><p>Your <strong>Semester ${semester} (${academicYear})</strong> result has been published.</p><a href="${pdfUrl}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Download Result PDF</a><p style="font-size:12px;color:#9ca3af;margin-top:24px">This is an automated message from AcadEase.</p></div>`,
    });
  }

  if (student.parentPhone) {
    await sendSms(
      student.parentPhone,
      `AcadEase: ${student.name}'s Semester ${semester} (${academicYear}) result is published. Download: ${pdfUrl}`
    );
  }

  res.json({ message: "Result published and notifications sent.", pdfPath: storagePath });
}

// POST /api/results/semester/:studentId/upload-pdf
export async function uploadResultPdf(req, res) {
  const { studentId } = req.params;
  const { semester, academicYear } = req.body;
  if (!req.file) return res.status(400).json({ error: "PDF file required" });
  if (!semester || !academicYear) return res.status(400).json({ error: "semester and academicYear required" });

  const storagePath = `storage/results/${req.file.filename}`;
  await Result.findOneAndUpdate(
    { studentId, semester: Number(semester), academicYear },
    { $set: { pdfPath: storagePath, releasedAt: new Date(), enteredBy: req.user.userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const student = await User.findOne({ userId: studentId }).select("name email parentPhone");
  const apiBase = process.env.API_URL || "http://localhost:5000";
  const pdfUrl = `${apiBase}/${storagePath}`;

  if (student?.email) {
    await sendEmail({
      to: student.email,
      subject: `Semester ${semester} Result — ${academicYear}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px"><h2 style="color:#1a1a2e">Semester Result Published</h2><p>Hi <strong>${student.name}</strong>,</p><p>Your <strong>Semester ${semester} (${academicYear})</strong> result has been published.</p><a href="${pdfUrl}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Download Result PDF</a><p style="font-size:12px;color:#9ca3af;margin-top:24px">This is an automated message from AcadEase.</p></div>`,
    });
  }

  if (student?.parentPhone) {
    await sendSms(
      student.parentPhone,
      `AcadEase: ${student.name}'s Semester ${semester} (${academicYear}) result is published. Download: ${pdfUrl}`
    );
  }

  await pushNotification({
    userId: studentId,
    type: "result_published",
    priority: "high",
    title: "Semester Result Published",
    message: `Your Semester ${semester} (${academicYear}) result is now available.`,
    linkTo: "/student/results",
  });

  res.json({ message: "PDF uploaded and notifications sent.", pdfPath: storagePath });
}

// GET /api/results/student/:studentId  — semester (university) results
export async function getStudentResults(req, res) {
  const { studentId } = req.params;
  // Students can see their own results; admins/faculty can see any
  const isSelf = req.user.userId === studentId;
  const filter = isSelf
    ? { studentId }                              // own: show all (released or not for demo)
    : { studentId, releasedAt: { $ne: null } };  // others: only released
  const results = await Result.find(filter).sort({ academicYear: 1, semester: 1 });
  res.json({ results });
}

// GET /api/results/student/:studentId/sessions
// Returns distinct {academicYear, semester, semesterLabel} pairs that have
// either internal marks or semester results — used to populate the dropdown.
export async function getStudentSessions(req, res) {
  const { studentId } = req.params;

  // Sessions from internal marks (via enrolled courses)
  const marks = await Marks.find({ studentId }).populate("assessmentId", "courseId");
  const courseIds = [...new Set(marks.map((m) => m.assessmentId?.courseId).filter(Boolean))];
  const courses = await Course.find({ courseId: { $in: courseIds } });

  const internalSessions = new Map();
  for (const c of courses) {
    const key = `${c.academicYear}__${c.semester}`;
    if (!internalSessions.has(key)) {
      internalSessions.set(key, { academicYear: c.academicYear, semester: c.semester });
    }
  }

  // Sessions from semester results
  const semResults = await Result.find({ studentId }).select("academicYear semester");
  const semSessions = new Map();
  for (const r of semResults) {
    const key = `${r.academicYear}__${r.semester}`;
    if (!semSessions.has(key)) {
      semSessions.set(key, { academicYear: r.academicYear, semester: r.semester });
    }
  }

  // Merge and sort
  const allKeys = new Set([...internalSessions.keys(), ...semSessions.keys()]);
  const sessions = [...allKeys]
    .map((key) => {
      const s = internalSessions.get(key) || semSessions.get(key);
      return {
        academicYear: s.academicYear,
        semester: s.semester,
        semesterType: s.semester % 2 !== 0 ? "ODD" : "EVEN",
        hasInternal: internalSessions.has(key),
        hasSemResult: semSessions.has(key),
        label: `${s.academicYear} — Sem ${s.semester} (${s.semester % 2 !== 0 ? "ODD" : "EVEN"})`,
      };
    })
    .sort((a, b) =>
      a.academicYear.localeCompare(b.academicYear) || a.semester - b.semester
    );

  res.json({ sessions });
}

// ── Shared helper: aggregate marks for one student across a list of courses ──
async function aggregateStudentSubjects(studentId, courses) {
  const subjects = [];
  for (const course of courses) {
    const assessments = await Assessment.find({ courseId: course.courseId, marksPublished: true });
    if (assessments.length === 0) {
      subjects.push({
        courseId: course.courseId,
        courseName: course.name,
        grade: "U",
        marksObtained: 0,
        maxMarks: 100,
        result: "fail",
      });
      continue;
    }
    const assessmentIds = assessments.map((a) => a._id);
    const marks = await Marks.find({ studentId, assessmentId: { $in: assessmentIds } });

    let totalObtained = 0;
    let totalMax = 0;
    let hasMarks = false;

    for (const a of assessments) {
      const m = marks.find((mk) => mk.assessmentId.toString() === a._id.toString());
      if (m) {
        hasMarks = true;
        if (!m.isAbsent && m.marksObtained != null) totalObtained += m.marksObtained;
        totalMax += a.maxMarks;
      }
    }

    const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    const finalScore = Math.round(percentage);

    let grade = "U";
    if (hasMarks) {
      if (percentage >= 90)      grade = "O";
      else if (percentage >= 80) grade = "A+";
      else if (percentage >= 70) grade = "A";
      else if (percentage >= 60) grade = "B+";
      else if (percentage >= 50) grade = "B";
      else if (percentage >= 45) grade = "C";
    }

    subjects.push({
      courseId: course.courseId,
      courseName: course.name,
      grade,
      marksObtained: finalScore,
      maxMarks: 100,
      result: grade === "U" ? "fail" : "pass",
    });
  }

  const gradePoints = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, U: 0 };
  const gpa = subjects.length
    ? (subjects.reduce((s, sub) => s + (gradePoints[sub.grade] ?? 0), 0) / subjects.length).toFixed(2)
    : "0.00";
  const overallResult = subjects.every((s) => s.result === "pass") ? "pass" : "fail";

  return { subjects, gpa, overallResult };
}

// GET /api/results/semester/preview?semester=5&academicYear=2024-2025&departmentId=CSE_2024
export async function previewSemesterResults(req, res) {
  const { semester, academicYear, departmentId } = req.query;
  if (!semester || !academicYear) return res.status(400).json({ error: "semester and academicYear are required" });

  // Find all courses for this semester/year
  const courseFilter = { semester: Number(semester), academicYear };
  if (departmentId) courseFilter.departmentId = departmentId;
  const courses = await Course.find(courseFilter);
  if (courses.length === 0) return res.status(404).json({ error: "No courses found for this semester/year" });

  const courseIds = courses.map((c) => c.courseId);

  // Find all enrollments for these courses this year
  const enrollments = await Enrollment.find({ courseId: { $in: courseIds }, academicYear, isActive: true });
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

  const students = await User.find({ userId: { $in: studentIds }, role: "student" })
    .select("userId name enrollmentNumber departmentId")
    .sort({ name: 1 });

  const rows = [];
  for (const student of students) {
    // Only courses the student is enrolled in
    const studentEnrollments = enrollments.filter((e) => e.studentId === student.userId);
    const studentCourseIds = studentEnrollments.map((e) => e.courseId);
    const studentCourses = courses.filter((c) => studentCourseIds.includes(c.courseId));

    const { subjects, gpa, overallResult } = await aggregateStudentSubjects(student.userId, studentCourses);
    rows.push({
      studentId: student.userId,
      name: student.name,
      enrollmentNumber: student.enrollmentNumber,
      departmentId: student.departmentId,
      subjects,
      gpa,
      overallResult,
    });
  }

  res.json({ semester: Number(semester), academicYear, rows });
}

// POST /api/results/semester/publish-all
// body: { semester, academicYear, departmentId? }
export async function publishAllSemesterResults(req, res) {
  const { semester, academicYear, departmentId } = req.body;
  if (!semester || !academicYear) return res.status(400).json({ error: "semester and academicYear are required" });

  // Find courses
  const courseFilter = { semester: Number(semester), academicYear };
  if (departmentId) courseFilter.departmentId = departmentId;
  const courses = await Course.find(courseFilter);
  if (courses.length === 0) return res.status(404).json({ error: "No courses found for this semester/year" });

  const courseIds = courses.map((c) => c.courseId);
  const enrollments = await Enrollment.find({ courseId: { $in: courseIds }, academicYear, isActive: true });
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
  const students = await User.find({ userId: { $in: studentIds }, role: "student" })
    .select("userId name email parentPhone enrollmentNumber department departmentId");

  const apiBase = process.env.API_URL || "http://localhost:5000";
  const published = [];
  const failed = [];

  for (const student of students) {
    try {
      const studentEnrollments = enrollments.filter((e) => e.studentId === student.userId);
      const studentCourseIds = studentEnrollments.map((e) => e.courseId);
      const studentCourses = courses.filter((c) => studentCourseIds.includes(c.courseId));

      const { subjects } = await aggregateStudentSubjects(student.userId, studentCourses);

      // Upsert result document
      const result = await Result.findOneAndUpdate(
        { studentId: student.userId, semester: Number(semester), academicYear },
        { $set: { subjects, enteredBy: req.user.userId, releasedAt: new Date(), status: "published" } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Generate PDF
      const { storagePath } = await generateResultPdf({ student, result });
      await Result.findByIdAndUpdate(result._id, { pdfPath: storagePath });

      const pdfUrl = `${apiBase}/${storagePath}`;

      // In-app notification
      await pushNotification({
        userId: student.userId,
        type: "result_published",
        priority: "high",
        title: "Semester Result Published",
        message: `Your Semester ${semester} (${academicYear}) result is now available.`,
        linkTo: "/student/results",
      });

      // Email to student
      if (student.email) {
        await sendEmail({
          to: student.email,
          subject: `Semester ${semester} Result — ${academicYear}`,
          html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px"><h2 style="color:#1a1a2e">Semester Result Published</h2><p>Hi <strong>${student.name}</strong>,</p><p>Your <strong>Semester ${semester} (${academicYear})</strong> result has been published.</p><a href="${pdfUrl}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Download Result PDF</a><p style="font-size:12px;color:#9ca3af;margin-top:24px">This is an automated message from AcadEase.</p></div>`,
        });
      }

      // SMS to parent
      if (student.parentPhone) {
        await sendSms(
          student.parentPhone,
          `AcadEase: ${student.name}'s Semester ${semester} (${academicYear}) result is published. Download: ${pdfUrl}`
        );
      }

      published.push({ studentId: student.userId, name: student.name, pdfPath: storagePath });
    } catch (err) {
      console.error(`[publish-all] failed for ${student.userId}:`, err.message);
      failed.push({ studentId: student.userId, name: student.name, reason: err.message });
    }
  }

  res.json({
    message: `Published results for ${published.length} student(s).`,
    published: published.length,
    failed,
  });
}
