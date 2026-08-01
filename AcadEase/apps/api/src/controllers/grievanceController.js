import { Grievance, User } from "../models/index.js";
import { pushNotification } from "../utils/notify.js";
import { reissueCertificatesForGrievance, certificateTypesAffectedBy } from "../utils/certificateReissue.js";

const RECORD_KINDS = ["result", "marks", "attendance"];

// POST /api/grievances
export async function submitGrievance(req, res) {
  const studentId = req.user.userId;
  const { category, subject, description, attachmentPath, relatedRecord } = req.body;
  if (!category || !subject || !description) {
    return res.status(400).json({ error: "category, subject, and description are required" });
  }

  // A grievance may name the academic record it disputes. That link is what
  // later allows the resolution to correct any certificate issued from it.
  let record = undefined;
  if (relatedRecord && RECORD_KINDS.includes(relatedRecord.kind)) {
    record = {
      kind: relatedRecord.kind,
      resultId: relatedRecord.resultId || null,
      semester: relatedRecord.semester ?? null,
      academicYear: relatedRecord.academicYear || null,
      courseId: relatedRecord.courseId || null,
    };
  }

  const grievance = await Grievance.create({
    studentId,
    collegeId: req.user.collegeId || req.user.institutionId,
    departmentId: req.user.departmentId,
    category,
    subject,
    description,
    attachmentPath,
    ...(record ? { relatedRecord: record } : {}),
  });

  res.status(201).json({ message: `Grievance submitted with ID ${grievance._id}`, grievance });
}

// GET /api/grievances/student/:studentId
export async function getStudentGrievances(req, res) {
  const { studentId } = req.params;
  const grievances = await Grievance.find({ studentId }).sort({ createdAt: -1 });
  res.json({ grievances });
}

// GET /api/grievances  (admin — filterable)
export async function listGrievances(req, res) {
  const { status, category } = req.query;
  const filter = { departmentId: req.user.departmentId };
  if (status) filter.status = status;
  if (category) filter.category = category;
  const grievances = await Grievance.find(filter).sort({ createdAt: -1 });
  res.json({ grievances });
}

// PATCH /api/grievances/:id/acknowledge
export async function acknowledgeGrievance(req, res) {
  const { id } = req.params;
  const grievance = await Grievance.findById(id);
  if (!grievance) return res.status(404).json({ error: "Grievance not found" });

  grievance.status = "In Review";
  grievance.handledBy = req.user.userId;
  await grievance.save();

  await pushNotification({
    userId: grievance.studentId,
    type: "grievance_update",
    priority: "medium",
    title: "Grievance is being reviewed",
    message: `Your grievance "${grievance.subject}" is now in review.`,
    linkTo: "/student/grievances",
  });

  res.json({ grievance });
}

// PATCH /api/grievances/:id/resolve
//
// Body: { resolutionNote, recordCorrected }
//
// `recordCorrected` is the admin stating that the disputed record was actually
// changed, not merely explained. Only then does the certificate reissue fire —
// "we checked and the mark was right" must not revoke anybody's certificate.
export async function resolveGrievance(req, res) {
  const { id } = req.params;
  const { resolutionNote, recordCorrected } = req.body;
  const grievance = await Grievance.findById(id);
  if (!grievance) return res.status(404).json({ error: "Grievance not found" });

  grievance.status = "Resolved";
  grievance.resolutionNote = resolutionNote || "";
  grievance.handledBy = req.user.userId;
  grievance.resolvedAt = new Date();
  await grievance.save();

  // ── Certificate correction ────────────────────────────────────────────────
  // If the resolution changed a record a certificate was issued from, the stale
  // certificate is revoked as "superseded" and a replacement is issued through
  // the same signing path. Never silently edited: the old certId keeps
  // resolving, and tells anyone who scans it what replaced it.
  let certificateActions = [];
  if (recordCorrected && grievance.relatedRecord?.kind) {
    const actor = await User.findOne({ userId: req.user.userId }).select("name").lean();
    certificateActions = await reissueCertificatesForGrievance({
      grievance,
      actor: { userId: req.user.userId, role: req.user.role, name: actor?.name },
    });

    if (certificateActions.length > 0) {
      grievance.certificateActions = certificateActions;
      await grievance.save();
    }
  }

  const reissued = certificateActions.filter((a) => a.action === "revoked_and_reissued");
  await pushNotification({
    userId: grievance.studentId,
    type: "grievance_update",
    priority: "medium",
    title: "Grievance resolved",
    message: reissued.length
      ? `Your grievance "${grievance.subject}" has been resolved and ${reissued.length} certificate(s) were reissued from the corrected record.`
      : `Your grievance "${grievance.subject}" has been resolved.`,
    linkTo: "/student/grievances",
  });

  res.json({
    grievance,
    certificateActions,
    message: reissued.length
      ? `Resolved. ${reissued.length} certificate(s) revoked as superseded and reissued.`
      : "Resolved.",
  });
}

// GET /api/grievances/:id/certificate-impact
// What resolving this grievance *would* do, so the admin sees the consequence
// before they commit to it rather than after.
export async function getCertificateImpact(req, res) {
  const grievance = await Grievance.findById(req.params.id).lean();
  if (!grievance) return res.status(404).json({ error: "Grievance not found" });

  const kind = grievance.relatedRecord?.kind || null;
  const types = kind ? certificateTypesAffectedBy(kind) : [];

  if (types.length === 0) {
    return res.json({
      recordKind: kind,
      affectedTypes: [],
      certificates: [],
      note: kind
        ? "No certificate type is issued from this kind of record."
        : "This grievance does not name an academic record, so no certificate can be affected by it.",
    });
  }

  const { Certificate } = await import("../models/index.js");
  const certificates = await Certificate.find({
    studentId: grievance.studentId,
    type: { $in: types },
    status: "active",
  })
    .select("certId type issuedAt")
    .lean();

  res.json({
    recordKind: kind,
    affectedTypes: types,
    certificates,
    note: certificates.length
      ? `Resolving with "record corrected" will revoke ${certificates.length} certificate(s) as superseded and issue replacements.`
      : "No active certificate was issued from this record, so nothing will be reissued.",
  });
}

// PATCH /api/grievances/:id/reject
export async function rejectGrievance(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  const grievance = await Grievance.findById(id);
  if (!grievance) return res.status(404).json({ error: "Grievance not found" });

  grievance.status = "Rejected";
  grievance.rejectionReason = reason || "";
  grievance.handledBy = req.user.userId;
  await grievance.save();

  await pushNotification({
    userId: grievance.studentId,
    type: "grievance_update",
    priority: "medium",
    title: "Grievance rejected",
    message: `Your grievance "${grievance.subject}" was rejected. Reason: ${reason || "Not specified"}. You may resubmit once.`,
    linkTo: "/student/grievances",
  });

  res.json({ grievance });
}

// POST /api/grievances/:id/rating
export async function rateGrievance(req, res) {
  const { id } = req.params;
  const { rating } = req.body;
  const grievance = await Grievance.findById(id);
  if (!grievance) return res.status(404).json({ error: "Grievance not found" });
  if (grievance.status !== "Resolved") {
    return res.status(409).json({ error: "Can only rate a resolved grievance" });
  }

  grievance.satisfactionRating = rating;
  await grievance.save();
  res.json({ grievance });
}
