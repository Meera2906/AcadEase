// Seed script per PRD Section 9 — "An app with empty tables loses."
// Run with: npm run seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import {
  User,
  Department,
  Course,
  Enrollment,
  AttendanceRecord,
  ODRequest,
  Assessment,
  Marks,
  Result,
  CertificateRequest,
  Certificate,
  Grievance,
  Notification,
  XpLedger,
} from "../models/index.js";
import { generateCertId, signCertificate } from "../utils/certificate.js";

const INSTITUTION_ID = process.env.INSTITUTION_ID || "TNTEU_001";
const ACADEMIC_YEAR = "2024-2025";
const SEMESTER = 5;

async function clearCollections() {
  await Promise.all(
    [
      User,
      Department,
      Course,
      Enrollment,
      AttendanceRecord,
      ODRequest,
      Assessment,
      Marks,
      Result,
      CertificateRequest,
      Certificate,
      Grievance,
      Notification,
      XpLedger,
    ].map((m) => m.deleteMany({}))
  );
  console.log("[seed] cleared existing collections");
}

async function seedDepartments() {
  const departments = [
    { departmentId: "CSE_2024", institutionId: INSTITUTION_ID, name: "Computer Science and Engineering", code: "CSE" },
    { departmentId: "ECE_2024", institutionId: INSTITUTION_ID, name: "Electronics and Communication Engineering", code: "ECE" },
    { departmentId: "MECH_2024", institutionId: INSTITUTION_ID, name: "Mechanical Engineering", code: "MECH" },
  ];
  await Department.insertMany(departments);
  console.log(`[seed] ${departments.length} departments`);
  return departments;
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash("Passw0rd!", 12);

  const faculty = [
    { userId: "FAC_CSE_001", name: "Prof. Suresh Kumar", email: "suresh.kumar@tnteu.ac.in", departmentId: "CSE_2024", designation: "Assistant Professor", courseIds: ["CS301", "CS302"] },
    { userId: "FAC_CSE_002", name: "Dr. Lakshmi Narayanan", email: "lakshmi.n@tnteu.ac.in", departmentId: "CSE_2024", designation: "Associate Professor", courseIds: ["CS303", "CS304"] },
    { userId: "FAC_ECE_001", name: "Prof. Anitha Raman", email: "anitha.raman@tnteu.ac.in", departmentId: "ECE_2024", designation: "Assistant Professor", courseIds: ["CS305"] },
  ];

  const admin = [
    { userId: "ADM_CSE_001", name: "Mrs. Kavitha Selvam", email: "kavitha.selvam@tnteu.ac.in", departmentId: "CSE_2024", role: "admin", designation: "Department Office" },
    { userId: "SUP_001", name: "Dr. R. Venkataraman", email: "registrar@tnteu.ac.in", departmentId: "CSE_2024", role: "superadmin", designation: "Registrar" },
  ];

  const studentNames = [
    "Priya Ramachandran", "Aarav Krishnan", "Divya Shree", "Karthik Subramaniam", "Meera Pillai",
    "Niranjana Balaji", "Sanjay Mohan", "Kavya Sundaram", "Arjun Vijayakumar", "Deepika Rajan",
    "Vishal Anand", "Swathi Narayan", "Mayurika Sivakumar", "Monisha Ganesh", "Rahul Prakash",
  ];

  const students = studentNames.map((name, i) => {
    const num = String(i + 1).padStart(3, "0");
    const dept = i < 12 ? "CSE_2024" : "ECE_2024";
    return {
      userId: `STU_2021_${dept.startsWith("CSE") ? "CS" : "EC"}_${num}`,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@tnteu.ac.in`,
      departmentId: dept,
      role: "student",
      semester: SEMESTER,
      section: "A",
      batchYear: 2021,
      enrollmentNumber: `TNTEU21${dept.startsWith("CSE") ? "CS" : "EC"}${num}`,
    };
  });

  const facultyDocs = faculty.map((f) => ({
    ...f,
    role: "faculty",
    institutionId: INSTITUTION_ID,
    passwordHash,
    totpEnabled: false, // set up on first login per PRD 5.1.2
  }));
  const adminDocs = admin.map((a) => ({
    ...a,
    institutionId: INSTITUTION_ID,
    passwordHash,
    totpEnabled: false,
  }));
  const studentDocs = students.map((s) => ({
    ...s,
    institutionId: INSTITUTION_ID,
    passwordHash,
  }));

  await User.insertMany([...facultyDocs, ...adminDocs, ...studentDocs]);
  console.log(`[seed] ${facultyDocs.length} faculty, ${adminDocs.length} admin, ${studentDocs.length} students`);
  console.log('[seed] all seeded accounts use password: "Passw0rd!"');

  return { faculty: facultyDocs, admin: adminDocs, students: studentDocs };
}

async function seedCourses() {
  const courses = [
    { courseId: "CS301", name: "Database Management Systems", departmentId: "CSE_2024", facultyId: "FAC_CSE_001", semester: SEMESTER },
    { courseId: "CS302", name: "Operating Systems", departmentId: "CSE_2024", facultyId: "FAC_CSE_001", semester: SEMESTER },
    { courseId: "CS303", name: "Computer Networks", departmentId: "CSE_2024", facultyId: "FAC_CSE_002", semester: SEMESTER },
    { courseId: "CS304", name: "Artificial Intelligence", departmentId: "CSE_2024", facultyId: "FAC_CSE_002", semester: SEMESTER },
    { courseId: "CS305", name: "UI/UX Design Principles", departmentId: "ECE_2024", facultyId: "FAC_ECE_001", semester: SEMESTER },
  ].map((c) => ({ ...c, institutionId: INSTITUTION_ID, academicYear: ACADEMIC_YEAR }));

  await Course.insertMany(courses);
  console.log(`[seed] ${courses.length} courses`);
  return courses;
}

async function seedEnrollments(students, courses) {
  const enrollments = [];
  for (const s of students) {
    for (const c of courses) {
      enrollments.push({ studentId: s.userId, courseId: c.courseId, academicYear: ACADEMIC_YEAR });
    }
  }
  await Enrollment.insertMany(enrollments);
  console.log(`[seed] ${enrollments.length} enrollments`);
}

function weightedStatus(profile) {
  // profile: "good" | "average" | "struggling"
  const r = Math.random();
  const weights = {
    good: { present: 0.92, absent: 0.03, od: 0.03, late: 0.02 },
    average: { present: 0.8, absent: 0.1, od: 0.05, late: 0.05 },
    struggling: { present: 0.62, absent: 0.28, od: 0.06, late: 0.04 },
  }[profile];

  let cumulative = 0;
  for (const [status, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (r <= cumulative) return status;
  }
  return "present";
}

async function seedAttendance(students, courses) {
  const records = [];
  const today = new Date();
  const weeks = 6;

  const profiles = students.map((s, i) => {
    if (i % 5 === 0) return "struggling"; // ~20% struggling
    if (i % 3 === 0) return "average";
    return "good";
  });

  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 0; d < 5; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - w * 7 - d);
      date.setHours(0, 0, 0, 0);

      for (const course of courses) {
        for (let si = 0; si < students.length; si++) {
          const student = students[si];
          if (student.departmentId !== course.departmentId) continue;
          const status = weightedStatus(profiles[si]);
          records.push({
            courseId: course.courseId,
            studentId: student.userId,
            facultyId: course.facultyId,
            date,
            sessionTime: "09:00",
            status,
            markedAt: date,
          });
        }
      }
    }
  }

  // Force one demo scenario: a specific student's CS302 sits below 75%
  // (Section 9.3 — "Student checks dashboard, one subject is in danger")
  const demoStudent = students[0]; // Priya
  const demoRecords = records.filter((r) => r.studentId === demoStudent.userId && r.courseId === "CS302");
  demoRecords.slice(0, Math.floor(demoRecords.length * 0.3)).forEach((r) => (r.status = "absent"));

  await AttendanceRecord.insertMany(records, { ordered: false }).catch(() => {
    /* duplicate compound-index collisions from overlapping days are safe to ignore in a reseed */
  });
  console.log(`[seed] ~${records.length} attendance records (6 weeks)`);
}

async function seedOdRequests(students, courses) {
  const cseStudents = students.filter((s) => s.departmentId === "CSE_2024");
  const reasonTypes = ["Placement Drive", "Medical", "Event", "Personal", "Other"];
  const statuses = ["approved", "approved", "approved", "pending", "pending", "rejected", "rejected", "rejected"];

  const requests = statuses.map((status, i) => {
    const student = cseStudents[i % cseStudents.length];
    const course = courses[i % 4];
    return {
      studentId: student.userId,
      courseId: course.courseId,
      facultyId: course.facultyId,
      date: new Date(Date.now() - i * 86400000),
      reasonType: reasonTypes[i % reasonTypes.length],
      reasonDetails: "Seed demo data",
      status,
      facultyNote: status === "rejected" ? "No supporting document provided" : "",
      supportingDocPath: i === 0 ? "/uploads/demo-od-letter.pdf" : null,
    };
  });

  await ODRequest.insertMany(requests);
  console.log(`[seed] ${requests.length} OD requests`);
}

async function seedAssessmentsAndMarks(students, courses) {
  const cseStudents = students.filter((s) => s.departmentId === "CSE_2024");
  const cseCourses = courses.filter((c) => c.departmentId === "CSE_2024");

  const assessmentDefs = [];
  for (const course of cseCourses) {
    assessmentDefs.push({ courseId: course.courseId, type: "IA1", title: `${course.name} — IA1`, maxMarks: 100, createdBy: course.facultyId, marksPublished: true });
    assessmentDefs.push({ courseId: course.courseId, type: "Assignment", title: `${course.name} — Assignment 1`, maxMarks: 50, createdBy: course.facultyId, marksPublished: true });
  }
  assessmentDefs.push({ courseId: "CS301", type: "IA2", title: "Database Management Systems — IA2", maxMarks: 100, createdBy: "FAC_CSE_001", marksPublished: true });

  const assessments = await Assessment.insertMany(assessmentDefs);
  console.log(`[seed] ${assessments.length} assessments`);

  const marks = [];
  for (const assessment of assessments) {
    cseStudents.forEach((student, i) => {
      // Bell curve-ish distribution with two standout scores for the leaderboard demo
      let score;
      if (i === 0) score = Math.round(assessment.maxMarks * 0.96); // top scorer
      else if (i === 1) score = Math.round(assessment.maxMarks * 0.89); // second
      else {
        const base = 0.55 + Math.random() * 0.3; // 55-85%
        score = Math.round(assessment.maxMarks * base);
      }
      marks.push({
        assessmentId: assessment._id,
        courseId: assessment.courseId,
        studentId: student.userId,
        marksObtained: score,
        isAbsent: false,
        submittedAt: assessment.createdAt || new Date(),
      });
    });
  }

  await Marks.insertMany(marks);
  console.log(`[seed] ${marks.length} mark entries`);
}

async function seedCertificates(students) {
  const [s1, s2, s3, s4] = students;

  const requests = await CertificateRequest.insertMany([
    { studentId: s1.userId, type: "bonafide", purpose: "Bank account opening", status: "approved" },
    { studentId: s2.userId, type: "bonafide", purpose: "Scholarship application", status: "pending" },
    { studentId: s3.userId, type: "completion", purpose: "Job application", status: "approved" },
    { studentId: s4.userId, type: "attendance", purpose: "Internship documentation", status: "pending" },
  ]);

  // Fully issue one certificate so /verify/:certId has real data pre-seeded (PRD 9.3)
  const approvedRequest = requests[0];
  const certId = generateCertId();
  const issuedAt = new Date();
  const hmacSignature = signCertificate({
    certId,
    studentId: s1.userId,
    issuedAt,
    type: "bonafide",
    institutionId: INSTITUTION_ID,
  });

  const certificate = await Certificate.create({
    certId,
    studentId: s1.userId,
    type: "bonafide",
    requestId: approvedRequest._id,
    issuedAt,
    issuedBy: "ADM_CSE_001",
    institutionId: INSTITUTION_ID,
    studentName: s1.name,
    enrollmentNumber: s1.enrollmentNumber,
    department: s1.departmentId,
    academicYear: "2021",
    purpose: approvedRequest.purpose,
    hmacSignature,
    pdfPath: "storage/certificates/seed-placeholder.pdf",
    status: "active",
  });

  approvedRequest.certificateId = certificate._id;
  approvedRequest.reviewedBy = "ADM_CSE_001";
  approvedRequest.reviewedAt = issuedAt;
  await approvedRequest.save();

  console.log(`[seed] 4 certificate requests, 1 issued certificate (certId=${certId})`);
  console.log(`[seed] verify it at GET /api/certificates/verify/${certId}`);
}

async function seedGrievances(students) {
  const [s1, s2, s3] = students;
  await Grievance.insertMany([
    {
      studentId: s1.userId,
      departmentId: s1.departmentId,
      category: "Academic",
      subject: "IA1 marks not matching answer sheet",
      description: "My IA1 marks for CS301 seem lower than what I expected based on my answer sheet review.",
      status: "Resolved",
      resolutionNote: "Re-evaluated with faculty. Marks corrected from 68 to 74.",
      handledBy: "ADM_CSE_001",
      resolvedAt: new Date(),
      satisfactionRating: 4,
    },
    {
      studentId: s2.userId,
      departmentId: s2.departmentId,
      category: "Administrative",
      subject: "Certificate delay",
      description: "Requested bonafide certificate 5 days ago, still pending.",
      status: "In Review",
      handledBy: "ADM_CSE_001",
    },
    {
      studentId: s3.userId,
      departmentId: s3.departmentId,
      category: "Infrastructure",
      subject: "Lab systems not working",
      description: "3 out of 20 systems in the CS lab are not booting up.",
      status: "Open",
    },
  ]);
  console.log("[seed] 3 grievances");
}

async function seedSemesterResults(students) {
  const cseStudents = students.filter((s) => s.departmentId === "CSE_2024");
  const courses = [
    { courseId: "CS301", courseName: "Database Management Systems" },
    { courseId: "CS302", courseName: "Operating Systems" },
    { courseId: "CS303", courseName: "Computer Networks" },
    { courseId: "CS304", courseName: "Artificial Intelligence" },
    { courseId: "CS305", courseName: "UI/UX Design Principles" },
  ];

  const grades = ["O", "A+", "A", "B+", "B", "C", "U"];
  const gradeToMarks = { O: 91, "A+": 85, A: 75, "B+": 68, B: 60, C: 50, U: 38 };

  const results = cseStudents.map((student, si) => {
    const subjects = courses.map((c, ci) => {
      // Struggling students get lower grades
      const isStruggling = si % 5 === 0;
      const isAverage = si % 3 === 0;
      const gradePool = isStruggling
        ? ["C", "B", "U", "B+", "C"]
        : isAverage
        ? ["B+", "A", "B", "A+", "B+"]
        : ["A+", "O", "A", "A+", "A"];
      const grade = gradePool[ci % gradePool.length];
      const base = gradeToMarks[grade];
      const marksObtained = base + Math.floor(Math.random() * 5);
      return {
        courseId: c.courseId,
        courseName: c.courseName,
        grade,
        marksObtained,
        maxMarks: 100,
        result: grade === "U" ? "fail" : "pass",
      };
    });
    return {
      studentId: student.userId,
      semester: 4, // previous semester results
      academicYear: "2023-2024",
      subjects,
      enteredBy: "ADM_CSE_001",
      releasedAt: new Date("2024-05-15"),
    };
  });

  await Result.insertMany(results);
  console.log(`[seed] ${results.length} semester results (Sem 4, 2023-2024)`);
}

async function seedNotificationsAndXp(students) {
  const notifs = [];
  students.slice(0, 8).forEach((s, i) => {
    notifs.push({
      userId: s.userId,
      type: "marks_published",
      priority: "high",
      title: "Marks published",
      message: "Your IA1 marks for Database Management Systems are now available.",
      read: i % 2 === 0,
    });
    notifs.push({
      userId: s.userId,
      type: "streak_milestone",
      priority: "low",
      title: "7-day attendance streak!",
      message: "You've had full attendance for 7 consecutive days. Keep it up! 🔥",
      read: false,
    });
    notifs.push({
      userId: s.userId,
      type: "absent_alert",
      priority: "critical",
      title: "Absent alert",
      message: "You were marked absent for Operating Systems. Submit an OD request if applicable.",
      read: i > 2,
    });
  });
  await Notification.insertMany(notifs);

  // Rich XP event history — 90 days so ContributionGraph has real data
  const xpEvents = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Event templates with realistic point values
  const eventTemplates = [
    { event: "on_time_submission", points: 10 },
    { event: "full_attendance_week", points: 15 },
    { event: "early_certificate_request", points: 5 },
    { event: "streak_milestone", points: 20 },
  ];

  // Activity density per student profile (matches attendance profiles)
  const activityProfiles = students.map((_, i) => {
    if (i % 5 === 0) return 0.25; // struggling — sparse activity
    if (i % 3 === 0) return 0.55; // average
    return 0.80; // good — frequent activity
  });

  for (let si = 0; si < students.length; si++) {
    const student = students[si];
    const density = activityProfiles[si];

    for (let daysAgo = 89; daysAgo >= 0; daysAgo--) {
      // Skip weekends (realistic — no college on Sat/Sun)
      const d = new Date(today);
      d.setDate(today.getDate() - daysAgo);
      if (d.getDay() === 0 || d.getDay() === 6) continue;

      if (Math.random() > density) continue; // skip inactive days

      // 1–2 events per active day
      const numEvents = Math.random() < 0.3 ? 2 : 1;
      for (let e = 0; e < numEvents; e++) {
        const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
        xpEvents.push({
          studentId: student.userId,
          event: template.event,
          points: template.points,
          createdAt: new Date(d.getTime() + e * 3600000), // stagger by 1h
        });
      }
    }

    // Guarantee streak_milestone events at 7-day and 14-day marks for demo
    if (si === 0) {
      xpEvents.push({ studentId: student.userId, event: "streak_milestone", points: 20, createdAt: new Date(today.getTime() - 7 * 86400000) });
      xpEvents.push({ studentId: student.userId, event: "streak_milestone", points: 20, createdAt: new Date(today.getTime() - 14 * 86400000) });
    }
  }

  // Use insertMany with timestamps override
  await XpLedger.collection.insertMany(
    xpEvents.map((e) => ({ ...e, updatedAt: e.createdAt }))
  );

  console.log(`[seed] ${notifs.length} notifications, ${xpEvents.length} XP events (90-day history)`);
}

async function main() {
  await connectDB();
  await clearCollections();

  await seedDepartments();
  const { faculty, admin, students } = await seedUsers();
  const courses = await seedCourses();
  await seedEnrollments(students, courses);
  await seedAttendance(students, courses);
  await seedOdRequests(students, courses);
  await seedAssessmentsAndMarks(students, courses);
  await seedSemesterResults(students);
  await seedCertificates(students);
  await seedGrievances(students);
  await seedNotificationsAndXp(students);

  console.log("\n[seed] done. Demo logins (password for all: Passw0rd!):");
  console.log(`  Student:   ${students[0].userId}`);
  console.log(`  Faculty:   ${faculty[0].userId}`);
  console.log(`  Admin:     ${admin[0].userId}`);
  console.log(`  SuperAdmin:${admin[1].userId}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
