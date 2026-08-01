// Seeds the TNTEU-level picture: the two colleges `npm run seed` leaves nearly
// empty get their own staff, students, applicants and attendance, and every
// college gets a stack of governance requests waiting on the registrar's desk.
//
//   npm run seed:governance   (run after npm run seed)
//
// Without this, "College-wise analysis" is one populated row and two blank
// ones, and "College Requests" is an empty queue — neither of which shows what
// the screens are for.
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import {
  College,
  User,
  Department,
  Course,
  Applicant,
  Grievance,
  AttendanceRecord,
  UniversityRequest,
  Announcement,
  CIRCULAR_AUDIENCES,
} from "../models/index.js";

const INSTITUTION_ID = process.env.INSTITUTION_ID || "TNTEU_001";
const DEMO_PASSWORD = "Demo@2025";
const ACADEMIC_YEAR = "2025-2026";

// The colleges seed.js creates. The first already has a full department/course/
// attendance dataset; the other two are the ones we fill in here.
const HOST = "TNTEU_COL_0417";
const SATELLITES = [
  {
    collegeId: "TNTEU_COL_0912",
    short: "STT",
    deptCode: "EDU",
    deptName: "Teacher Education",
    principal: "Dr. R. Krishnamurthy",
    adminId: "ADM_0912_001",
    adminName: "Mr. S. Anbarasan",
    adminEmail: "office@sankara-tt.ac.in",
    facultyCount: 14,
    studentCount: 96,
    // Roughly how this college performs, so the analysis screen has contrast.
    attendanceBias: 0.88,
  },
  {
    collegeId: "TNTEU_COL_1188",
    short: "VBA",
    deptCode: "PED",
    deptName: "Pedagogical Sciences",
    principal: "Mrs. J. Geetha",
    adminId: "ADM_1188_001",
    adminName: "Mr. K. Thirumalai",
    adminEmail: "office@vellore-bed.ac.in",
    facultyCount: 6,
    studentCount: 41,
    attendanceBias: 0.71,
  },
];

const FIRST_NAMES = [
  "Aishwarya", "Balamurugan", "Chandran", "Dhanalakshmi", "Elango", "Fathima", "Gokul", "Hemalatha",
  "Iniya", "Jeyakumar", "Kalaiselvi", "Lokesh", "Mahalakshmi", "Nandhini", "Oviya", "Praveen",
  "Rajeshwari", "Sathish", "Thamarai", "Uma", "Vignesh", "Yazhini",
];
const LAST_NAMES = ["Murugan", "Rajan", "Subramani", "Natarajan", "Velmurugan", "Iyer", "Pandian", "Sekar"];

function personName(index) {
  return `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[index % LAST_NAMES.length]}`;
}

// Deterministic pseudo-randomness: the seed has to produce the same demo twice.
function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

async function clearPreviousRun() {
  const satelliteIds = SATELLITES.map((c) => c.collegeId);
  const students = await User.find({ collegeId: { $in: satelliteIds }, role: "student" }).select("userId").lean();
  const studentIds = students.map((s) => s.userId);

  await Promise.all([
    UniversityRequest.deleteMany({}),
    Announcement.deleteMany({}),
    Applicant.deleteMany({ collegeId: { $in: [...satelliteIds, HOST] }, source: "university_bulk", batchId: "SEED_GOV" }),
    AttendanceRecord.deleteMany({ studentId: { $in: studentIds } }),
    Grievance.deleteMany({ collegeId: { $in: satelliteIds } }),
    User.deleteMany({ collegeId: { $in: satelliteIds } }),
    Department.deleteMany({ collegeId: { $in: satelliteIds } }),
    Course.deleteMany({ collegeId: { $in: satelliteIds } }),
  ]);
  console.log("[seed:governance] cleared previous governance seed");
}

async function seedSatelliteCollege(college, passwordHash) {
  const exists = await College.findOne({ collegeId: college.collegeId }).lean();
  if (!exists) {
    console.log(`[seed:governance] ${college.collegeId} missing — run "npm run seed" first`);
    return null;
  }

  const departmentId = `${college.deptCode}_${college.collegeId.slice(-4)}`;
  await Department.create({
    departmentId,
    collegeId: college.collegeId,
    institutionId: college.collegeId,
    name: college.deptName,
    code: college.deptCode,
  });

  const faculty = Array.from({ length: college.facultyCount }, (_, i) => ({
    userId: `FAC_${college.short}_${String(i + 1).padStart(3, "0")}`,
    role: "faculty",
    name: `Prof. ${personName(i + 3)}`,
    email: `fac${i + 1}.${college.short.toLowerCase()}@tnteu.ac.in`,
    departmentId,
    designation: i === 0 ? "Head of Department" : "Assistant Professor",
    collegeId: college.collegeId,
    institutionId: college.collegeId,
    passwordHash,
    totpEnabled: false,
    isActive: true,
  }));

  const students = Array.from({ length: college.studentCount }, (_, i) => ({
    userId: `STU_${college.short}_${String(i + 1).padStart(3, "0")}`,
    role: "student",
    name: personName(i),
    email: `stu${i + 1}.${college.short.toLowerCase()}@tnteu.ac.in`,
    departmentId,
    collegeId: college.collegeId,
    institutionId: college.collegeId,
    semester: (i % 4) + 1,
    section: i % 2 === 0 ? "A" : "B",
    batchYear: i % 3 === 0 ? 2024 : 2025,
    enrollmentNumber: `TNTEU${college.collegeId.slice(-4)}${String(i + 1).padStart(3, "0")}`,
    passwordHash,
    isActive: i % 17 !== 0, // one or two inactive records, as a real register has
  }));

  await User.insertMany([
    {
      userId: college.adminId,
      role: "college_admin",
      name: college.adminName,
      email: college.adminEmail,
      departmentId,
      designation: "College Office",
      collegeId: college.collegeId,
      institutionId: college.collegeId,
      passwordHash,
      totpEnabled: false,
      isActive: true,
    },
    ...faculty,
    ...students,
  ]);

  // Two courses so attendance has something to hang off.
  const courses = [
    { courseId: `${college.deptCode}101`, name: "Foundations of Education", semester: 1 },
    { courseId: `${college.deptCode}201`, name: "Pedagogy of Mathematics", semester: 2 },
  ].map((c) => ({
    ...c,
    departmentId,
    collegeId: college.collegeId,
    institutionId: college.collegeId,
    section: "A",
    facultyId: faculty[0].userId,
    academicYear: ACADEMIC_YEAR,
  }));
  await Course.insertMany(courses);

  // Six weeks of attendance per student, biased so each college lands at a
  // different average — the whole point of a college-wise view.
  const records = [];
  const start = new Date("2026-06-01T00:00:00.000Z");
  students.forEach((student, si) => {
    if (student.isActive === false) return;
    const course = courses[si % courses.length];
    for (let day = 0; day < 30; day += 1) {
      const date = new Date(start.getTime() + day * 864e5);
      if ([0, 6].includes(date.getUTCDay())) continue;
      const roll = rand(si * 97 + day * 13);
      const status = roll < college.attendanceBias ? "present" : roll < college.attendanceBias + 0.04 ? "od" : "absent";
      records.push({
        collegeId: college.collegeId,
        courseId: course.courseId,
        studentId: student.userId,
        facultyId: course.facultyId,
        date,
        status,
      });
    }
  });
  await AttendanceRecord.insertMany(records, { ordered: false }).catch(() => {});

  // A handful of open grievances so the college-wise view has a welfare signal.
  await Grievance.insertMany(
    students.slice(0, 3).map((s, i) => ({
      collegeId: college.collegeId,
      studentId: s.userId,
      departmentId,
      category: ["Academic", "Infrastructure", "Administrative"][i],
      subject: ["Internal marks not published", "Lab has no power backup", "Bonafide certificate delayed"][i],
      description: "Raised during the demo governance seed so the college-wise view has live welfare data.",
      status: i === 2 ? "Resolved" : "Open",
    }))
  );

  console.log(
    `[seed:governance] ${college.collegeId}: 1 admin, ${faculty.length} faculty, ${students.length} students, ${records.length} attendance rows`
  );
  return { departmentId, students, faculty };
}

// Applicants sitting at every stage of the pipeline, so seat utilisation and
// approval rates differ per college instead of all reading 0%.
async function seedApplicants() {
  // Sized so each college lands at a different, realistic fill against its own
  // sanctioned matrix — that contrast is the point of the college-wise view.
  const plan = [
    { collegeId: HOST, bed: 62, med: 24, verified: 66, rejected: 9, enrolled: 58 },
    { collegeId: "TNTEU_COL_0912", bed: 88, med: 36, verified: 104, rejected: 14, enrolled: 96 },
    { collegeId: "TNTEU_COL_1188", bed: 34, med: 14, verified: 43, rejected: 4, enrolled: 41 },
  ];

  // Enrolled applicants point at a real student login wherever the college has
  // one, so the UMIS register can show which pipeline a student arrived through.
  const studentsByCollege = new Map();
  for (const entry of plan) {
    const students = await User.find({ collegeId: entry.collegeId, role: "student" })
      .select("userId")
      .sort({ userId: 1 })
      .lean();
    studentsByCollege.set(entry.collegeId, students.map((s) => s.userId));
  }

  const docs = [];
  plan.forEach((entry, ci) => {
    const realStudents = studentsByCollege.get(entry.collegeId) || [];
    const total = entry.bed + entry.med;
    for (let i = 0; i < total; i += 1) {
      const isMed = i >= entry.bed;
      const decidedVerified = i < entry.verified;
      const decidedRejected = !decidedVerified && i < entry.verified + entry.rejected;
      const enrolled = i < entry.enrolled;

      docs.push({
        applicantId: `SEED_${entry.collegeId.slice(-4)}_${String(i + 1).padStart(3, "0")}`,
        collegeId: entry.collegeId,
        batchId: "SEED_GOV",
        name: personName(ci * 7 + i),
        program: isMed ? "MEd" : "BEd",
        dob: `0${(i % 9) + 1}-0${(i % 9) + 1}-200${i % 4}`,
        gender: i % 2 === 0 ? "F" : "M",
        email: `applicant${i + 1}.${entry.collegeId.slice(-4)}@example.com`,
        phone: `98400${String(10000 + i).slice(-5)}`,
        rollNumber: `${entry.collegeId.slice(-4)}A${String(i + 1).padStart(3, "0")}`,
        category: ["OC", "BC", "MBC", "SC", "ST"][i % 5],
        tenthPercentage: 60 + Math.round(rand(ci * 31 + i) * 35),
        twelfthPercentage: 58 + Math.round(rand(ci * 41 + i) * 36),
        ugPercentage: 52 + Math.round(rand(ci * 53 + i) * 40),
        bedPercentage: isMed ? 60 + Math.round(rand(ci * 59 + i) * 30) : null,
        stage: enrolled ? "enrolled" : "submitted",
        status: enrolled || decidedVerified ? "verified" : decidedRejected ? "rejected" : i % 3 === 0 ? "under_review" : "submitted",
        rejectionReason: decidedRejected ? "Transfer certificate did not match the applicant's name" : null,
        studentUserId: enrolled ? realStudents[i] || null : null,
        enrolledAt: enrolled ? new Date("2026-07-15T00:00:00.000Z") : null,
        submittedAt: new Date(Date.UTC(2026, 5, 1 + (i % 25))),
        source: "university_bulk",
      });
    }
  });

  await Applicant.insertMany(docs, { ordered: false }).catch(() => {});
  console.log(`[seed:governance] ${docs.length} applicants across ${plan.length} colleges`);
}

// The College Requests queue: seat allocation is the headline case, alongside
// the affiliation, programme, staff and exam-centre business that arrives with it.
async function seedUniversityRequests() {
  const now = Date.now();
  const day = 864e5;
  const requests = [
    {
      requestId: "UR_2026_A31F07",
      collegeId: HOST,
      type: "seat_increase",
      title: "Increase B.Ed sanctioned intake from 100 to 150",
      description:
        "The college has completed the new academic block with six additional method labs and has appointed nine full-time teaching staff this year. Admissions closed at 100% of the sanctioned intake for three consecutive years with a waiting list of 212 candidates in 2025-26. We request the seat matrix be revised to 150 B.Ed seats for 2026-2027.",
      academicYear: "2026-2027",
      details: { currentBedSeats: 100, requestedBedSeats: 150, currentMedSeats: 50, requestedMedSeats: 50, additionalFaculty: 9, additionalClassrooms: 6 },
      priority: "urgent",
      status: "submitted",
      submittedBy: "ADM_CSE_001",
      daysAgo: 4,
    },
    {
      requestId: "UR_2026_B72C19",
      collegeId: "TNTEU_COL_0912",
      type: "seat_increase",
      title: "Seat matrix revision — 30 additional M.Ed seats",
      description:
        "Demand for the M.Ed programme in the Chennai region has outrun our sanctioned 50 seats for two admission cycles. Infrastructure and the staff-to-student ratio statement for a 80-seat intake are attached. We request a revision of the M.Ed seat matrix from 50 to 80.",
      academicYear: "2026-2027",
      details: { currentMedSeats: 50, requestedMedSeats: 80, staffRatio: "1:12", waitlist2025: 96 },
      priority: "routine",
      status: "under_review",
      submittedBy: "ADM_0912_001",
      daysAgo: 11,
    },
    {
      requestId: "UR_2026_C18D44",
      collegeId: "TNTEU_COL_1188",
      type: "seat_increase",
      title: "Restore B.Ed intake to 100 seats after infrastructure remediation",
      description:
        "Following the 2024 inspection, our sanctioned intake was reduced to 60 seats pending remediation of the library and ICT laboratory. Both works are complete and certified by the district engineer. We request restoration of the original 100-seat B.Ed matrix.",
      academicYear: "2026-2027",
      details: { currentBedSeats: 60, requestedBedSeats: 100, remediationCompletedOn: "2026-04-18" },
      priority: "urgent",
      status: "clarification_requested",
      submittedBy: "ADM_1188_001",
      daysAgo: 19,
      messages: [
        {
          authorId: "SUP_001",
          authorRole: "tnteu_admin",
          authorName: "Dr. R. Venkataraman",
          body: "Attach the district engineer's completion certificate with the inspection reference number, and the current list of full-time faculty against the 100-seat ratio.",
          daysAgo: 6,
        },
      ],
    },
    {
      requestId: "UR_2026_D90E02",
      collegeId: HOST,
      type: "affiliation_renewal",
      title: "Affiliation renewal for the academic year 2026-2027",
      description:
        "Annual renewal of affiliation. Previous affiliation order, infrastructure compliance report and the consolidated staff list for 2025-26 are attached as required.",
      academicYear: "2026-2027",
      details: { previousOrderNo: "TNTEU/AFF/0417/2025", inspectionDue: true },
      priority: "routine",
      status: "submitted",
      submittedBy: "ADM_CSE_001",
      daysAgo: 2,
    },
    {
      requestId: "UR_2026_E55A61",
      collegeId: "TNTEU_COL_0912",
      type: "new_programme",
      title: "Approval to start M.Ed (Special Education — Learning Disability)",
      description:
        "We propose to start a two-year M.Ed in Special Education with an intake of 25. The curriculum outline follows the RCI framework, and four RCI-registered faculty have been appointed. Programme proposal and faculty availability statement are attached.",
      academicYear: "2026-2027",
      details: { proposedIntake: 25, duration: "2 years", regulator: "RCI", rciRegisteredFaculty: 4 },
      priority: "routine",
      status: "submitted",
      submittedBy: "ADM_0912_001",
      daysAgo: 7,
    },
    {
      requestId: "UR_2026_F23B88",
      collegeId: "TNTEU_COL_1188",
      type: "faculty_approval",
      title: "Recognition of six newly appointed assistant professors",
      description:
        "Six assistant professors were appointed in June 2026 through a duly constituted selection committee. Appointment orders, qualification certificates and the selection committee minutes are attached for TNTEU recognition.",
      academicYear: "2026-2027",
      details: { appointments: 6, selectionCommitteeDate: "2026-06-09" },
      priority: "routine",
      status: "approved",
      submittedBy: "ADM_1188_001",
      daysAgo: 34,
      decidedDaysAgo: 21,
      decisionNote: "Recognition granted for all six appointments with effect from 01-07-2026.",
    },
    {
      requestId: "UR_2026_A77C31",
      collegeId: HOST,
      type: "exam_centre",
      title: "Designation as an examination centre for the November 2026 session",
      description:
        "We apply to be designated an examination centre for the November 2026 B.Ed examinations. The facility report covers 12 halls with a combined seating capacity of 480 under CCTV coverage, and the invigilator list is attached.",
      academicYear: "2026-2027",
      details: { halls: 12, seatingCapacity: 480, cctv: true },
      priority: "routine",
      status: "approved",
      submittedBy: "ADM_CSE_001",
      daysAgo: 26,
      decidedDaysAgo: 17,
      decisionNote: "Designated as examination centre code 0417-A for the November 2026 session.",
    },
    {
      requestId: "UR_2026_B44D75",
      collegeId: "TNTEU_COL_0912",
      type: "course_revision",
      title: "Revision of the B.Ed second-year ICT pedagogy course",
      description:
        "The Board of Studies has resolved to replace the existing ICT in Education paper with a revised course covering computational thinking and digital assessment. The revision proposal and the board resolution are attached.",
      academicYear: "2026-2027",
      details: { paperCode: "BED-204", credits: 4, boardResolutionDate: "2026-05-22" },
      priority: "routine",
      status: "rejected",
      submittedBy: "ADM_0912_001",
      daysAgo: 41,
      decidedDaysAgo: 29,
      decisionNote:
        "Rejected: the proposed credit change conflicts with the common B.Ed regulation. Resubmit at 3 credits with the mapped outcomes.",
    },
    {
      requestId: "UR_2026_C61E09",
      collegeId: "TNTEU_COL_1188",
      type: "other",
      title: "Extension of the last date for submitting the 2025-26 audited accounts",
      description:
        "Our statutory auditor's report has been delayed by the change of the college's financial software. We request an extension of six weeks for submitting the audited accounts for 2025-26.",
      academicYear: "2025-2026",
      details: { requestedExtensionWeeks: 6 },
      priority: "routine",
      status: "draft",
      submittedBy: "ADM_1188_001",
      daysAgo: 1,
    },
  ];

  const docs = requests.map((r) => {
    const submittedAt = r.status === "draft" ? null : new Date(now - r.daysAgo * day);
    const reviewedAt = r.decidedDaysAgo != null ? new Date(now - r.decidedDaysAgo * day) : null;
    return {
      requestId: r.requestId,
      collegeId: r.collegeId,
      type: r.type,
      title: r.title,
      description: r.description,
      academicYear: r.academicYear,
      details: r.details,
      priority: r.priority,
      status: r.status,
      submittedBy: r.submittedBy,
      submittedAt,
      reviewedBy: reviewedAt ? "SUP_001" : null,
      reviewedAt,
      decisionNote: r.decisionNote || "",
      messages: (r.messages || []).map((m) => ({
        authorId: m.authorId,
        authorRole: m.authorRole,
        authorName: m.authorName,
        body: m.body,
        sentAt: new Date(now - m.daysAgo * day),
      })),
      createdAt: submittedAt || new Date(now - day),
    };
  });

  await UniversityRequest.insertMany(docs);
  const pending = docs.filter((d) => ["submitted", "under_review", "clarification_requested"].includes(d.status)).length;
  console.log(`[seed:governance] ${docs.length} college requests (${pending} awaiting TNTEU's decision)`);
}

async function seedCirculars() {
  const circulars = [
    {
      title: "Revised academic calendar for the odd semester 2026-2027",
      body: "The odd semester begins on 03 August 2026. Internal assessment I is scheduled for the week of 14 September and the practical examinations for the week of 09 November. Principals are requested to publish the college-level timetable within seven days.",
      audiences: ["students", "faculty", "admins"],
      scope: "university",
    },
    {
      title: "Mandatory verification of admission documents before enrolment",
      body: "No candidate is to be enrolled until every required document has cleared both stages of verification on AcadEase. College offices must clear their stage-one queue within 72 hours of a bulk submission.",
      audiences: ["admins"],
      scope: "university",
    },
    {
      title: "Faculty development programme on inclusive pedagogy",
      body: "A five-day FDP on inclusive pedagogy will be conducted from 22 to 26 September 2026 in blended mode. Each affiliated college is to nominate a minimum of two faculty members through the college office.",
      audiences: ["faculty", "admins"],
      scope: "university",
    },
    {
      title: "Examination fee payment window now open",
      body: "The examination fee for the November 2026 session may be paid until 30 September 2026 without a late fee, and until 10 October with a late fee of Rs. 500. Payment is through the college office only.",
      audiences: ["students"],
      scope: "university",
    },
  ];

  await Announcement.insertMany(
    circulars.map((c) => ({
      ...c,
      audience: c.audiences.length === CIRCULAR_AUDIENCES.length ? "all" : c.audiences[0],
      collegeId: HOST,
      institutionId: INSTITUTION_ID,
      createdBy: "SUP_001",
      createdByName: "Dr. R. Venkataraman",
      createdByRole: "tnteu_admin",
    }))
  );
  console.log(`[seed:governance] ${circulars.length} university circulars`);
}

async function main() {
  await connectDB();
  await clearPreviousRun();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  for (const college of SATELLITES) {
    await seedSatelliteCollege(college, passwordHash);
  }

  // Vellore's intake was cut to 60 after the 2024 inspection — the restoration
  // request seeded below only reads as a real request if the record agrees.
  await College.updateOne({ collegeId: "TNTEU_COL_1188" }, { $set: { bedSeats: 60, medSeats: 25 } });

  await seedApplicants();
  await seedUniversityRequests();
  await seedCirculars();

  console.log("\n[seed:governance] done. Sign in as SUP_001 / Demo@2025 (TNTEU) to see:");
  console.log("  • Analysis         — three colleges with different intake, attendance and approval rates");
  console.log("  • College Requests — seat matrix revisions and affiliation business awaiting a decision");
  console.log("  • Circulars        — four university-wide circulars already distributed");
  console.log("  • Student Data     — the UMIS register across all three colleges");

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error("[seed:governance] failed:", err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
