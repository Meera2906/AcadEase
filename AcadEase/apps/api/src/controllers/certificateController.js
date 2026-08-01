import { CertificateRequest, Certificate, User, AttendanceRecord, Result, AuditLog } from "../models/index.js";
import { generateCertId, signCertificate, verifyCertificateSignature, generateCertificatePdf, issueSignedDownloadToken } from "../utils/certificate.js";
import { signApproval, verifyChain, lastSignature, keyIdForActor, SIGNATURE_ALGORITHM } from "../utils/approvalChain.js";
import { keyFingerprint, TNTEU_KEY_ID } from "../utils/keyring.js";
import { pushNotification } from "../utils/notify.js";

// A merit certificate asserts academic distinction, so it carries a threshold
// the server checks against published results — a student cannot request one
// they have not earned, and the university is not left to catch it by eye.
const MERIT_THRESHOLD = 75;

async function evaluateMerit(studentId) {
  const results = await Result.find({ studentId, status: "published" }).lean();
  if (!results.length) {
    return { eligible: false, reason: "No published results are on record yet." };
  }

  let obtained = 0;
  let maximum = 0;
  let failed = 0;

  results.forEach((result) => {
    (result.subjects || []).forEach((subject) => {
      if (typeof subject.marksObtained === "number" && typeof subject.maxMarks === "number") {
        obtained += subject.marksObtained;
        maximum += subject.maxMarks;
      }
      if (subject.result === "fail") failed += 1;
    });
  });

  const percentage = maximum ? Number(((obtained / maximum) * 100).toFixed(2)) : 0;

  if (failed > 0) {
    return { eligible: false, percentage, reason: `A merit certificate requires no arrears. You have ${failed} failed subject(s).` };
  }
  if (percentage < MERIT_THRESHOLD) {
    return { eligible: false, percentage, reason: `A merit certificate requires ${MERIT_THRESHOLD}% overall. Yours is ${percentage}%.` };
  }
  return { eligible: true, percentage, semesters: results.length };
}

// GET /api/certificates/eligibility
export async function getCertificateEligibility(req, res) {
  const studentId = req.user.userId;
  const [merit, records] = await Promise.all([
    evaluateMerit(studentId),
    AttendanceRecord.find({ studentId, status: { $ne: "holiday" } }).select("status").lean(),
  ]);

  const attended = records.filter((r) => ["present", "od", "late"].includes(r.status)).length;
  const attendancePct = records.length ? Number(((attended / records.length) * 100).toFixed(1)) : 0;

  res.json({
    merit,
    attendance: {
      eligible: attendancePct >= 75,
      percentage: attendancePct,
      reason: attendancePct >= 75 ? null : `Attendance certificates require over 75%. Yours is ${attendancePct}%.`,
    },
    meritThreshold: MERIT_THRESHOLD,
  });
}

// POST /api/certificates/request
export async function requestCertificate(req, res) {
  const studentId = req.user.userId;
  const { type, purpose, notes } = req.body;
  if (!type || !purpose) return res.status(400).json({ error: "type and purpose are required" });

  const student = await User.findOne({ userId: studentId }).select("collegeId institutionId name").lean();
  if (!student) return res.status(404).json({ error: "Student record not found" });

  // Server-side eligibility validation (PRD 5.4.2)
  if (type === "attendance") {
    const records = await AttendanceRecord.find({ studentId, status: { $ne: "holiday" } });
    const attended = records.filter((r) => ["present", "od", "late"].includes(r.status)).length;
    const pct = records.length ? (attended / records.length) * 100 : 0;
    if (pct < 75) {
      return res.status(400).json({ error: `Attendance certificate requires >75% attendance. Current: ${pct.toFixed(1)}%` });
    }
  }

  if (type === "merit") {
    const merit = await evaluateMerit(studentId);
    if (!merit.eligible) return res.status(400).json({ error: merit.reason, merit });
  }

  const collegeId = student.collegeId || student.institutionId;
  if (!collegeId) return res.status(400).json({ error: "Your account is not linked to a university" });

  // Every request starts at the college. It only reaches TNTEU once the
  // university that taught the student has signed for it.
  const request = await CertificateRequest.create({
    studentId,
    collegeId,
    type,
    purpose,
    notes,
    stage: "college_review",
    awaitingRole: "college_admin",
    status: "pending",
  });

  await notifyRole(collegeId, ["college_admin", "college_coordinator"], {
    title: "Certificate request to review",
    message: `${student.name} has requested a ${type} certificate. It needs your approval before it goes to TNTEU.`,
    linkTo: "/admin/certificates",
  });

  res.status(201).json({ message: "Certificate request submitted to your university", request });
}

function notifyRole(collegeId, roles, payload) {
  return User.find({ collegeId, role: { $in: roles } })
    .select("userId")
    .lean()
    .then((users) =>
      Promise.all(users.map((user) => pushNotification({ userId: user.userId, type: "certificate_ready", ...payload }).catch(() => {})))
    )
    .catch(() => {});
}

async function auditApproval(req, action, request, approval) {
  try {
    await AuditLog.create({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action,
      collegeId: request.collegeId,
      targetType: "CertificateRequest",
      targetId: String(request._id),
      metadata: {
        studentId: request.studentId,
        certificateType: request.type,
        stage: approval.stage,
        decision: approval.decision,
        remarks: approval.remarks,
        keyId: approval.keyId,
        payloadDigest: approval.payloadDigest,
      },
    });
  } catch {
    // audit is best effort
  }
}

// GET /api/certificates/requests
// A university sees only its own students; TNTEU sees everything. `mine=true`
// narrows to what this role actually has to act on right now.
export async function listCertificateRequests(req, res) {
  const filter = {};

  if (req.user.role !== "tnteu_admin") {
    const collegeId = req.user.collegeId || req.user.institutionId;
    if (!collegeId) return res.status(403).json({ error: "Your account is not linked to a university" });
    filter.collegeId = collegeId;
  } else if (req.query.collegeId) {
    filter.collegeId = String(req.query.collegeId);
  }

  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.stage) filter.stage = String(req.query.stage);
  if (req.query.mine === "true") {
    filter.awaitingRole = req.user.role === "tnteu_admin" ? "tnteu_admin" : "college_admin";
  }

  const requests = await CertificateRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("certificateId", "certId status revokedAt revokedReason");

  const mapped = requests.map((request) => {
    const obj = request.toObject();
    obj.certificateCertId = obj.certificateId?.certId || null;
    obj.certificateStatus = obj.certificateId?.status || null;
    obj.stageLabel = STAGES[obj.stage]?.label || obj.stage;
    obj.actionable =
      obj.awaitingRole ===
      (req.user.role === "tnteu_admin" ? "tnteu_admin" : "college_admin");
    return obj;
  });

  // Counts for the two work queues, so each dashboard can badge its inbox.
  const awaitingMine = mapped.filter((r) => r.actionable).length;

  res.json({ requests: mapped, awaitingMine });
}

// GET /api/certificates/requests/student/:studentId
export async function listStudentCertificateRequests(req, res) {
  const { studentId } = req.params;
  const isSelf = req.user.userId === studentId;
  const isPrivileged = ["college_admin", "tnteu_admin", "admin", "superadmin"].includes(req.user.role);

  if (!isSelf && !isPrivileged) {
    if (req.user.role !== "faculty") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const student = await User.findOne({ userId: studentId }).select("departmentId institutionId");
    if (!student || student.departmentId !== req.user.departmentId || student.institutionId !== req.user.institutionId) {
      return res.status(403).json({ error: "Forbidden: faculty can only view students in their department" });
    }
  }

  const requests = await CertificateRequest.find({ studentId })
    .sort({ createdAt: -1 })
    .populate("certificateId", "certId pdfPath status");

  const mapped = requests.map((r) => {
    const obj = r.toObject();
    obj.certId = obj.certificateId?.certId || null;
    obj.pdfPath = obj.certificateId?.pdfPath || null;
    obj.certificateStatus = obj.certificateId?.status || null;
    return obj;
  });
  res.json({ requests: mapped });
}

// ---------------------------------------------------------------------------
// The approval chain: student → university → TNTEU → back down again.
//
// Each institution signs with its own private key over its own decision plus
// the signature of the stage before it. Neither can produce the other's
// signature, and neither can be removed from the finished certificate without
// invalidating everything after it.
// ---------------------------------------------------------------------------

// Who is allowed to act, and what happens next, at each stage.
const STAGES = {
  college_review: {
    roles: ["college_admin", "college_coordinator"],
    nextStage: "tnteu_review",
    nextRole: "tnteu_admin",
    label: "University approval",
  },
  tnteu_review: {
    roles: ["tnteu_admin"],
    nextStage: "issued",
    nextRole: null,
    label: "TNTEU approval",
  },
};

function loadStage(request, req) {
  const stage = STAGES[request.stage];
  if (!stage) {
    return { error: `This request is already ${request.stage === "issued" ? "issued" : request.stage}`, status: 409 };
  }
  if (!stage.roles.includes(req.user.role)) {
    return { error: `This request is awaiting ${STAGES[request.stage].label.toLowerCase()}, not yours`, status: 403 };
  }
  // A university may only sign for its own students.
  if (req.user.role !== "tnteu_admin" && request.collegeId !== (req.user.collegeId || req.user.institutionId)) {
    return { error: "This request belongs to another university", status: 403 };
  }
  return { stage };
}

async function appendApproval(request, req, decision, remarks) {
  const keyId = keyIdForActor(req.user);
  if (!keyId) throw Object.assign(new Error("Your role holds no signing key"), { status: 403 });

  const actor = await User.findOne({ userId: req.user.userId }).select("name").lean();

  const approval = signApproval({
    subjectType: "certificate_request",
    subjectId: String(request._id),
    stage: request.stage,
    decision,
    actorId: req.user.userId,
    actorName: actor?.name || req.user.userId,
    actorRole: req.user.role,
    keyId,
    remarks: remarks || "",
    previousSignature: lastSignature(request.approvals),
  });

  request.approvals.push(approval);
  return approval;
}

// PATCH /api/certificates/request/:id/approve
// Advances one stage. At the college it forwards to TNTEU; at TNTEU it issues.
export async function approveCertificateRequest(req, res) {
  const request = await CertificateRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found" });

  const { stage, error, status } = loadStage(request, req);
  if (error) return res.status(status).json({ error });

  const student = await User.findOne({ userId: request.studentId });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const approval = await appendApproval(request, req, "approved", req.body?.remarks);
  await auditApproval(req, "certificate_stage_approved", request, approval);

  // ── Stage 1: the university has signed. Hand it up to TNTEU. ──
  if (stage.nextStage !== "issued") {
    request.stage = stage.nextStage;
    request.awaitingRole = stage.nextRole;
    await request.save();

    await notifyRole(null, ["tnteu_admin"], {
      title: "Certificate awaiting TNTEU approval",
      message: `${student.name}'s ${request.type} certificate was approved by their university and needs your counter-signature.`,
      linkTo: "/admin/certificates",
    });
    await pushNotification({
      userId: student.userId,
      type: "certificate_ready",
      title: "Your university approved your request",
      message: `Your ${request.type} certificate request is now with TNTEU for final approval.`,
      linkTo: "/student/certificates",
    });

    return res.json({
      message: "Approved and forwarded to TNTEU",
      stage: request.stage,
      approvals: request.approvals,
      request,
    });
  }

  // ── Stage 2: TNTEU has signed. The certificate is generated now. ──
  const certId = generateCertId();
  const issuedAt = new Date();

  const certDraft = {
    certId,
    collegeId: request.collegeId,
    studentId: student.userId,
    type: request.type,
    requestId: request._id,
    issuedAt,
    issuedBy: req.user.userId,
    institutionId: student.institutionId || request.collegeId,
    studentName: student.name,
    enrollmentNumber: student.enrollmentNumber || student.userId,
    department: student.departmentId,
    academicYear: `${student.batchYear || ""}`.trim() || "N/A",
    purpose: request.purpose,
    hmacSignature: signCertificate({
      certId,
      studentId: student.userId,
      issuedAt,
      type: request.type,
      institutionId: student.institutionId || request.collegeId,
    }),
  };

  // TNTEU's signature over the finished certificate, chained onto the
  // approvals that authorised it.
  const issuerApproval = signApproval({
    subjectType: "certificate",
    subjectId: certId,
    stage: "issued",
    decision: "approved",
    actorId: req.user.userId,
    actorName: approval.actorName,
    actorRole: req.user.role,
    keyId: TNTEU_KEY_ID,
    remarks: `${request.type} certificate issued to ${student.name}`,
    previousSignature: lastSignature(request.approvals),
  });

  const approvalChain = [...request.approvals.map((a) => (a.toObject ? a.toObject() : a)), issuerApproval];

  const verifyBaseUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const { pdfPath } = await generateCertificatePdf(
    { ...certDraft, approvalChain },
    { verifyBaseUrl }
  );

  const { token, expiresAt } = issueSignedDownloadToken();
  const certificate = await Certificate.create({
    ...certDraft,
    approvalChain,
    issuerSignature: issuerApproval.signature,
    issuerKeyId: TNTEU_KEY_ID,
    issuerKeyFingerprint: keyFingerprint(TNTEU_KEY_ID),
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    pdfPath,
    downloadUrlToken: token,
    downloadUrlExpiresAt: expiresAt,
  });

  request.approvals.push(issuerApproval);
  request.stage = "issued";
  request.awaitingRole = null;
  request.status = "approved";
  request.reviewedBy = req.user.userId;
  request.reviewedAt = new Date();
  request.certificateId = certificate._id;
  await request.save();

  // The outcome travels back down the chain it came up.
  await notifyRole(request.collegeId, ["college_admin", "college_coordinator"], {
    title: "Certificate issued by TNTEU",
    message: `${student.name}'s ${request.type} certificate has been counter-signed and issued.`,
    linkTo: "/admin/certificates",
  });
  await pushNotification({
    userId: student.userId,
    type: "certificate_ready",
    priority: "high",
    title: "Your certificate is ready",
    message: `Your ${request.type} certificate has been approved by your university and TNTEU, and is ready to download.`,
    linkTo: "/student/certificates",
  });

  res.json({
    message: "Counter-signed and issued",
    stage: "issued",
    certificate,
    approvals: request.approvals,
  });
}

// PATCH /api/certificates/request/:id/reject
// A rejection at either stage ends the request, and is signed too — so the
// reason on file is provably the reason that was given.
export async function rejectCertificateRequest(req, res) {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 5) {
    return res.status(400).json({ error: "A rejection reason of at least 5 characters is required" });
  }

  const request = await CertificateRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found" });

  const { error, status } = loadStage(request, req);
  if (error) return res.status(status).json({ error });

  const rejectedStage = request.stage;
  const approval = await appendApproval(request, req, "rejected", reason);
  await auditApproval(req, "certificate_stage_rejected", request, approval);

  request.stage = "rejected";
  request.awaitingRole = null;
  request.status = "rejected";
  request.rejectionReason = reason;
  request.rejectedBy = req.user.userId;
  request.rejectedStage = rejectedStage;
  request.reviewedBy = req.user.userId;
  request.reviewedAt = new Date();
  await request.save();

  const by = rejectedStage === "tnteu_review" ? "TNTEU" : "your university";
  await pushNotification({
    userId: request.studentId,
    type: "certificate_ready",
    priority: "medium",
    title: "Certificate request rejected",
    message: `Your ${request.type} certificate request was rejected by ${by}: ${reason}`,
    linkTo: "/student/certificates",
  });

  if (rejectedStage === "tnteu_review") {
    await notifyRole(request.collegeId, ["college_admin", "college_coordinator"], {
      title: "TNTEU rejected a certificate you approved",
      message: `The ${request.type} certificate for ${request.studentId} was rejected by TNTEU: ${reason}`,
      linkTo: "/admin/certificates",
    });
  }

  res.json({ message: "Request rejected", request });
}

// GET /api/certificates/download/:certId
export async function downloadCertificate(req, res) {
  const { certId } = req.params;
  const cert = await Certificate.findOne({ certId });
  if (!cert) return res.status(404).json({ error: "Certificate not found" });

  const isOwner = req.user?.userId === cert.studentId;
  const isPrivileged = ["college_admin", "tnteu_admin", "admin", "superadmin"].includes(req.user?.role);
  if (!isOwner && !isPrivileged) {
    if (req.user?.role !== "faculty") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const student = await User.findOne({ userId: cert.studentId }).select("departmentId institutionId");
    if (!student || student.departmentId !== req.user.departmentId || student.institutionId !== req.user.institutionId) {
      return res.status(403).json({ error: "Forbidden: faculty can only access certificates in their department" });
    }
  }

  if (!cert.downloadUrlExpiresAt || cert.downloadUrlExpiresAt < new Date()) {
    const { token, expiresAt } = issueSignedDownloadToken();
    cert.downloadUrlToken = token;
    cert.downloadUrlExpiresAt = expiresAt;
    await cert.save();
  }

  cert.downloadCount += 1;
  await cert.save();

  res.json({
    certId: cert.certId,
    downloadToken: cert.downloadUrlToken,
    expiresAt: cert.downloadUrlExpiresAt,
    pdfPath: cert.pdfPath,
  });
}

// GET /api/certificates/verify/:certId  (public, no auth)
export async function verifyCertificate(req, res) {
  const { certId } = req.params;
  const cert = await Certificate.findOne({ certId });

  if (!cert) {
    return res.status(404).json({ verified: false, message: "This certificate could not be verified. Contact the institution." });
  }

  const signatureValid = verifyCertificateSignature(cert);

  // Re-check every counter-signature from the stored public keys. Anyone
  // scanning the QR gets the same answer we would: which institutions signed,
  // in what order, and whether each signature still matches what it signed.
  // The approval links bind to the request; the final issuance link binds to
  // the certificate itself, so both subjects are permitted in this chain.
  const chain = verifyChain(cert.approvalChain || [], "certificate_request", String(cert.requestId), [
    ["certificate", cert.certId],
  ]);
  const issuerCheck = chain.links.find((link) => link.stage === "issued") || null;

  // Older certificates issued before counter-signing existed fall back to the
  // HMAC alone rather than being reported as broken.
  const hasChain = (cert.approvalChain || []).length > 0;
  const chainValid = !hasChain || (chain.valid || chain.links.every((l) => l.valid));

  const isActive = cert.status === "active" && signatureValid && chainValid;

  // Only the minimal, non-sensitive fields per PRD 5.4.4 — no marks, no attendance, no contact info.
  res.json({
    verified: isActive,
    status: cert.status,
    studentName: cert.studentName,
    certificateType: cert.type,
    issueDate: cert.issuedAt,
    institutionId: cert.institutionId,
    signatureValid,
    chainValid,
    signatureAlgorithm: cert.signatureAlgorithm || "hmac-sha256 (legacy)",
    issuerKeyFingerprint: cert.issuerKeyFingerprint || null,
    // The audit trail, in plain terms: who authorised this and when.
    approvals: chain.links.map((link) => ({
      stage: link.stage,
      label:
        link.stage === "college_review" ? "Approved by the university"
        : link.stage === "tnteu_review" ? "Counter-signed by TNTEU"
        : link.stage === "issued" ? "Issued and sealed by TNTEU"
        : link.stage,
      authority: link.authority,
      decision: link.decision,
      decidedBy: link.actorName || link.actorId,
      decidedAt: link.decidedAt,
      keyFingerprint: link.keyFingerprint,
      algorithm: link.algorithm,
      signatureValid: link.valid,
      problem: link.reason,
    })),
    issuerSignatureValid: issuerCheck ? issuerCheck.valid : null,
    message: isActive
      ? `Certificate verified. Authorised by ${chain.links.length} institutional signature(s).`
      : cert.status === "revoked"
        ? "This certificate has been revoked by the institution."
        : !chainValid
          ? "The approval chain on this certificate does not verify — it has been altered since it was issued."
          : "This certificate could not be verified. The signature is invalid or the record is incomplete.",
  });
}

// PATCH /api/certificates/:certId/revoke
export async function revokeCertificate(req, res) {
  const { certId } = req.params;
  const { reason } = req.body;
  const cert = await Certificate.findOne({ certId });
  if (!cert) return res.status(404).json({ error: "Certificate not found" });
  if (cert.status === "revoked") return res.status(409).json({ error: "Certificate already revoked" });

  cert.status = "revoked";
  cert.revokedAt = new Date();
  cert.revokedBy = req.user.userId;
  cert.revokedReason = reason || "";
  await cert.save();

  res.json({ message: "Certificate revoked", cert });
}
