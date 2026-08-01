// College-wise analysis for TNTEU.
//
// The registrar's question is never "how is the university doing" — it is
// "which of my 3 (or 300) affiliated colleges is behind, and on what". So every
// figure here is per college, computed in one aggregation pass per collection
// rather than N queries per college.
import {
  College,
  User,
  Applicant,
  DocumentSubmission,
  UniversityRequest,
  Grievance,
  Certificate,
  AttendanceRecord,
} from "../models/index.js";

const TNTEU_ROLES = ["tnteu_admin", "superadmin"];

function assertAnalyticsAccess(req) {
  if (!TNTEU_ROLES.includes(req.user.role)) {
    throw Object.assign(new Error("College-wise analysis is limited to TNTEU"), { status: 403 });
  }
}

// Turn [{_id: {collegeId, k}, count}] into { collegeId: { k: count } }.
function nest(rows) {
  const out = new Map();
  rows.forEach((row) => {
    const collegeId = row._id?.collegeId ?? row._id;
    const key = row._id?.k;
    if (!out.has(collegeId)) out.set(collegeId, {});
    if (key == null) out.set(collegeId, { ...out.get(collegeId), count: row.count });
    else out.get(collegeId)[key] = row.count;
  });
  return out;
}

const sumOf = (bucket = {}) => Object.values(bucket).reduce((a, b) => a + (b || 0), 0);

// GET /api/admin/analytics/colleges
export async function getCollegeAnalytics(req, res) {
  assertAnalyticsAccess(req);

  const colleges = await College.find({}).sort({ name: 1 }).lean();
  const collegeIds = colleges.map((c) => c.collegeId);

  const [
    usersByRole,
    applicantsByStatus,
    applicantsByProgram,
    enrolledByCollege,
    docsByStage,
    requestsByStatus,
    grievancesByStatus,
    certsByCollege,
  ] = await Promise.all([
    User.aggregate([
      { $match: { collegeId: { $in: collegeIds } } },
      { $group: { _id: { collegeId: "$collegeId", k: "$role" }, count: { $sum: 1 } } },
    ]),
    Applicant.aggregate([
      { $match: { collegeId: { $in: collegeIds } } },
      { $group: { _id: { collegeId: "$collegeId", k: "$status" }, count: { $sum: 1 } } },
    ]),
    Applicant.aggregate([
      { $match: { collegeId: { $in: collegeIds } } },
      { $group: { _id: { collegeId: "$collegeId", k: "$program" }, count: { $sum: 1 } } },
    ]),
    Applicant.aggregate([
      { $match: { collegeId: { $in: collegeIds }, stage: "enrolled" } },
      { $group: { _id: { collegeId: "$collegeId" }, count: { $sum: 1 } } },
    ]),
    DocumentSubmission.aggregate([
      { $match: { collegeId: { $in: collegeIds } } },
      { $group: { _id: { collegeId: "$collegeId", k: "$status" }, count: { $sum: 1 } } },
    ]),
    UniversityRequest.aggregate([
      { $match: { collegeId: { $in: collegeIds } } },
      { $group: { _id: { collegeId: "$collegeId", k: "$status" }, count: { $sum: 1 } } },
    ]),
    Grievance.aggregate([
      { $match: { collegeId: { $in: collegeIds } } },
      { $group: { _id: { collegeId: "$collegeId", k: "$status" }, count: { $sum: 1 } } },
    ]),
    Certificate.aggregate([
      { $match: { collegeId: { $in: collegeIds } } },
      { $group: { _id: { collegeId: "$collegeId" }, count: { $sum: 1 } } },
    ]),
  ]);

  // Attendance has to be averaged per student first, then per college — the
  // naive record-level average silently weights heavy-timetable departments.
  const attendanceRows = await AttendanceRecord.aggregate([
    { $match: { status: { $ne: "holiday" } } },
    {
      $group: {
        _id: "$studentId",
        total: { $sum: 1 },
        attended: { $sum: { $cond: [{ $in: ["$status", ["present", "od", "late"]] }, 1, 0] } },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "userId",
        as: "student",
        pipeline: [{ $project: { collegeId: 1 } }],
      },
    },
    { $unwind: "$student" },
    {
      $group: {
        _id: "$student.collegeId",
        avgPercentage: { $avg: { $multiply: [{ $divide: ["$attended", "$total"] }, 100] } },
        tracked: { $sum: 1 },
        chronic: { $sum: { $cond: [{ $lt: [{ $divide: ["$attended", "$total"] }, 0.65] }, 1, 0] } },
      },
    },
  ]);

  const roles = nest(usersByRole);
  const applicantStatus = nest(applicantsByStatus);
  const applicantProgram = nest(applicantsByProgram);
  const enrolled = nest(enrolledByCollege);
  const docs = nest(docsByStage);
  const requests = nest(requestsByStatus);
  const grievances = nest(grievancesByStatus);
  const certs = nest(certsByCollege);
  const attendance = new Map(attendanceRows.map((r) => [r._id, r]));

  const rows = colleges.map((college) => {
    const id = college.collegeId;
    const role = roles.get(id) || {};
    const appStatus = applicantStatus.get(id) || {};
    const program = applicantProgram.get(id) || {};
    const doc = docs.get(id) || {};
    const req_ = requests.get(id) || {};
    const grv = grievances.get(id) || {};
    const att = attendance.get(id) || {};

    const sanctioned = (college.bedSeats || 0) + (college.medSeats || 0);
    const enrolledCount = enrolled.get(id)?.count || 0;
    const applicantsTotal = sumOf(appStatus);
    const verified = appStatus.verified || 0;
    const rejected = appStatus.rejected || 0;
    const decided = verified + rejected;

    return {
      collegeId: id,
      name: college.name,
      district: college.district,
      affiliationCode: college.affiliationCode,
      status: college.status,

      people: {
        students: role.student || 0,
        faculty: role.faculty || 0,
        admins: (role.college_admin || 0) + (role.college_coordinator || 0),
      },

      seats: {
        bed: college.bedSeats || 0,
        med: college.medSeats || 0,
        sanctioned,
        filled: enrolledCount,
        vacant: Math.max(0, sanctioned - enrolledCount),
        utilisation: sanctioned ? Math.round((enrolledCount / sanctioned) * 1000) / 10 : 0,
      },

      admissions: {
        applicants: applicantsTotal,
        bed: program.BEd || 0,
        med: program.MEd || 0,
        submitted: appStatus.submitted || 0,
        underReview: appStatus.under_review || 0,
        verified,
        rejected,
        enrolled: enrolledCount,
        approvalRate: decided ? Math.round((verified / decided) * 1000) / 10 : null,
      },

      documents: {
        total: sumOf(doc),
        pending: doc.pending || 0,
        verified: doc.verified || 0,
        rejected: doc.rejected || 0,
      },

      requests: {
        total: sumOf(req_),
        pending: (req_.submitted || 0) + (req_.under_review || 0) + (req_.clarification_requested || 0),
        approved: req_.approved || 0,
        rejected: req_.rejected || 0,
      },

      grievances: {
        total: sumOf(grv),
        open: (grv.Open || 0) + (grv["In Review"] || 0),
      },

      attendance: {
        average: att.avgPercentage != null ? Math.round(att.avgPercentage * 10) / 10 : null,
        tracked: att.tracked || 0,
        chronicAbsentees: att.chronic || 0,
      },

      certificatesIssued: certs.get(id)?.count || 0,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      colleges: acc.colleges + 1,
      students: acc.students + r.people.students,
      faculty: acc.faculty + r.people.faculty,
      applicants: acc.applicants + r.admissions.applicants,
      enrolled: acc.enrolled + r.admissions.enrolled,
      sanctioned: acc.sanctioned + r.seats.sanctioned,
      pendingDocuments: acc.pendingDocuments + r.documents.pending,
      pendingRequests: acc.pendingRequests + r.requests.pending,
      openGrievances: acc.openGrievances + r.grievances.open,
    }),
    { colleges: 0, students: 0, faculty: 0, applicants: 0, enrolled: 0, sanctioned: 0, pendingDocuments: 0, pendingRequests: 0, openGrievances: 0 }
  );

  const withAttendance = rows.filter((r) => r.attendance.average != null);

  res.json({
    colleges: rows,
    totals: {
      ...totals,
      seatUtilisation: totals.sanctioned ? Math.round((totals.enrolled / totals.sanctioned) * 1000) / 10 : 0,
      averageAttendance: withAttendance.length
        ? Math.round((withAttendance.reduce((s, r) => s + r.attendance.average, 0) / withAttendance.length) * 10) / 10
        : null,
      studentFacultyRatio: totals.faculty ? Math.round((totals.students / totals.faculty) * 10) / 10 : null,
    },
    generatedAt: new Date().toISOString(),
  });
}
