import { CertificateRequest, Certificate, User, AttendanceRecord } from "../models/index.js";
import { generateCertId, signCertificate, verifyCertificateSignature, generateCertificatePdf, issueSignedDownloadToken } from "../utils/certificate.js";
import { pushNotification } from "../utils/notify.js";

// POST /api/certificates/request
export async function requestCertificate(req, res) {
  const studentId = req.user.userId;
  const { type, purpose, notes } = req.body;
  if (!type || !purpose) return res.status(400).json({ error: "type and purpose are required" });

  // Server-side eligibility validation (PRD 5.4.2)
  if (type === "attendance") {
    const records = await AttendanceRecord.find({ studentId, status: { $ne: "holiday" } });
    const attended = records.filter((r) => ["present", "od", "late"].includes(r.status)).length;
    const pct = records.length ? (attended / records.length) * 100 : 0;
    if (pct < 75) {
      return res.status(400).json({ error: `Attendance certificate requires >75% attendance. Current: ${pct.toFixed(1)}%` });
    }
  }

  const request = await CertificateRequest.create({ studentId, type, purpose, notes });
  res.status(201).json({ message: "Certificate request submitted", request });
}

// GET /api/certificates/requests
export async function listCertificateRequests(req, res) {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const requests = await CertificateRequest.find(filter)
    .sort({ createdAt: -1 })
    .populate("certificateId", "certId status revokedAt revokedReason");

  const mapped = requests.map((request) => {
    const obj = request.toObject();
    obj.certificateCertId = obj.certificateId?.certId || null;
    obj.certificateStatus = obj.certificateId?.status || null;
    return obj;
  });

  res.json({ requests: mapped });
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

// PATCH /api/certificates/request/:id/approve
export async function approveCertificateRequest(req, res) {
  const { id } = req.params;
  const request = await CertificateRequest.findById(id);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "pending") return res.status(409).json({ error: "Request already processed" });

  const student = await User.findOne({ userId: request.studentId });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const certId = generateCertId();
  const issuedAt = new Date();
  const hmacSignature = signCertificate({
    certId,
    studentId: student.userId,
    issuedAt,
    type: request.type,
    institutionId: student.institutionId,
  });

  const certDraft = {
    certId,
    studentId: student.userId,
    type: request.type,
    requestId: request._id,
    issuedAt,
    issuedBy: req.user.userId,
    institutionId: student.institutionId,
    studentName: student.name,
    enrollmentNumber: student.enrollmentNumber || student.userId,
    department: student.departmentId,
    academicYear: `${student.batchYear || ""}`.trim() || "N/A",
    purpose: request.purpose,
    hmacSignature,
  };

  const verifyBaseUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const { pdfPath } = await generateCertificatePdf(certDraft, { verifyBaseUrl });

  const { token, expiresAt } = issueSignedDownloadToken();

  const certificate = await Certificate.create({
    ...certDraft,
    pdfPath,
    downloadUrlToken: token,
    downloadUrlExpiresAt: expiresAt,
  });

  request.status = "approved";
  request.reviewedBy = req.user.userId;
  request.reviewedAt = new Date();
  request.certificateId = certificate._id;
  await request.save();

  await pushNotification({
    userId: student.userId,
    type: "certificate_ready",
    priority: "high",
    title: "Certificate ready",
    message: `Your ${request.type} certificate is ready to download.`,
    linkTo: "/student/certificates",
  });

  res.json({ message: "Certificate approved and generated", certificate });
}

// PATCH /api/certificates/request/:id/reject
export async function rejectCertificateRequest(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  const request = await CertificateRequest.findById(id);
  if (!request) return res.status(404).json({ error: "Request not found" });

  request.status = "rejected";
  request.rejectionReason = reason || "";
  request.reviewedBy = req.user.userId;
  request.reviewedAt = new Date();
  await request.save();

  await pushNotification({
    userId: request.studentId,
    type: "certificate_ready",
    priority: "medium",
    title: "Certificate request rejected",
    message: `Your ${request.type} certificate request was rejected. Reason: ${reason || "Not specified"}`,
    linkTo: "/student/certificates",
  });

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
  const isActive = cert.status === "active" && signatureValid;

  // Only the minimal, non-sensitive fields per PRD 5.4.4 — no marks, no attendance, no contact info.
  res.json({
    verified: isActive,
    status: cert.status,
    studentName: cert.studentName,
    certificateType: cert.type,
    issueDate: cert.issuedAt,
    institutionId: cert.institutionId,
    signatureValid,
    message: isActive ? "Certificate verified successfully." : cert.status === "revoked" ? "This certificate has been revoked by the institution." : "This certificate could not be verified. The signature is invalid or the record is incomplete.",
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
