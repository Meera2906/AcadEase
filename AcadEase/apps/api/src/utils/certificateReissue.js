// Certificate revoke-and-reissue, driven by a resolved grievance.
//
// The problem this solves: a student disputes a mark, the college agrees and
// corrects it — and the merit certificate already issued from that mark is now
// wrong. The old answer was for somebody to remember to regenerate it by hand,
// or to quietly edit the record and leave a signed PDF in the world that no
// longer matches. Neither is acceptable when the certificate is the artefact a
// future employer checks.
//
// So the correction reuses the machinery that already exists to stop forgery:
// the stale certificate is *revoked* (never edited, never deleted) with the
// reason "superseded", a replacement is issued through the same signing path
// with a fresh HMAC and its own QR, and the two are linked in both directions.
// Anyone scanning the old QR is told it was superseded and by which
// certificate. The audit trail stays whole.
import { Certificate, CertificateRequest, Result, User, AuditLog } from "../models/index.js";
import { generateCertId, signCertificate, generateCertificatePdf, issueSignedDownloadToken } from "./certificate.js";
import { signApproval, lastSignature, SIGNATURE_ALGORITHM } from "./approvalChain.js";
import { keyFingerprint, TNTEU_KEY_ID } from "./keyring.js";
import { pushNotification } from "./notify.js";

// Which certificate types actually assert something derived from which record.
// A bonafide or character certificate says "this person is our student" — a
// corrected mark does not change that, so those are deliberately left alone.
const AFFECTED_BY = {
  result: ["merit", "completion"],
  marks: ["merit", "completion"],
  attendance: ["attendance"],
};

export function certificateTypesAffectedBy(recordKind) {
  return AFFECTED_BY[recordKind] || [];
}

// Rebuilds the content snapshot from what is true *now*, which is the whole
// point: the record has just been corrected.
async function buildSnapshot(student, oldCert, certId, issuedAt) {
  return {
    certId,
    collegeId: oldCert.collegeId,
    studentId: student.userId,
    type: oldCert.type,
    requestId: oldCert.requestId, // the replacement traces to the original request
    issuedAt,
    issuedBy: oldCert.issuedBy,
    institutionId: student.institutionId || oldCert.institutionId,
    studentName: student.name,
    enrollmentNumber: student.enrollmentNumber || student.userId,
    department: student.departmentId || oldCert.department,
    academicYear: `${student.batchYear || ""}`.trim() || oldCert.academicYear,
    purpose: oldCert.purpose,
    hmacSignature: signCertificate({
      certId,
      studentId: student.userId,
      issuedAt,
      type: oldCert.type,
      institutionId: student.institutionId || oldCert.institutionId,
    }),
  };
}

async function reissueOne({ oldCert, student, actor, grievance }) {
  const certId = generateCertId();
  const issuedAt = new Date();
  const draft = await buildSnapshot(student, oldCert, certId, issuedAt);

  // A new link on the same chain: TNTEU signs the reissue, over the approvals
  // that authorised the original. The chain is extended, not restarted, so the
  // replacement still carries proof of the university's original approval.
  const reissueApproval = signApproval({
    subjectType: "certificate",
    subjectId: certId,
    stage: "reissued",
    decision: "approved",
    actorId: actor.userId,
    actorName: actor.name || actor.userId,
    actorRole: actor.role,
    keyId: TNTEU_KEY_ID,
    remarks: `Reissued after grievance ${grievance._id} was resolved and the underlying record corrected. Supersedes ${oldCert.certId}.`,
    previousSignature: lastSignature(oldCert.approvalChain || []),
  });

  const approvalChain = [...(oldCert.approvalChain || []), reissueApproval];
  const verifyBaseUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const { pdfPath, pdfHash } = await generateCertificatePdf({ ...draft, approvalChain }, { verifyBaseUrl });
  const { token, expiresAt } = issueSignedDownloadToken();

  const replacement = await Certificate.create({
    ...draft,
    approvalChain,
    issuerSignature: reissueApproval.signature,
    issuerKeyId: TNTEU_KEY_ID,
    issuerKeyFingerprint: keyFingerprint(TNTEU_KEY_ID),
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    pdfPath,
    pdfHash,
    downloadUrlToken: token,
    downloadUrlExpiresAt: expiresAt,
    status: "active",
    supersedes: oldCert.certId,
    reissuedFromGrievance: grievance._id,
  });

  // Only now is the old one withdrawn — if PDF generation had failed above, the
  // student would still hold a valid certificate rather than none at all.
  oldCert.status = "revoked";
  oldCert.revocationType = "superseded";
  oldCert.revokedAt = new Date();
  oldCert.revokedBy = actor.userId;
  oldCert.revokedReason = `Superseded after grievance ${grievance._id} was resolved: the record this certificate was issued from has been corrected.`;
  oldCert.supersededBy = replacement.certId;
  await oldCert.save();

  // Re-point the originating request at the replacement. The student's
  // certificate list is built from their requests, so without this the page
  // keeps showing the old, now-revoked certificate and the reissued one is
  // invisible to the person it was issued for — which defeats the entire point
  // of reissuing it.
  if (oldCert.requestId) {
    await CertificateRequest.updateOne(
      { _id: oldCert.requestId },
      { certificateId: replacement._id }
    ).catch(() => {});
  }

  return replacement;
}

/**
 * Revokes and reissues every active certificate whose content derives from the
 * record a resolved grievance disputed.
 *
 * Deliberately narrow: it does nothing at all unless the grievance names a
 * record (`relatedRecord.kind`), and even then only touches the certificate
 * types that assert something about that kind of record.
 *
 * Never throws — a failure to reissue must not roll back the resolution of a
 * student's grievance. Failures are recorded against the grievance instead.
 *
 * @returns {Promise<Array>} one entry per certificate considered
 */
export async function reissueCertificatesForGrievance({ grievance, actor }) {
  const kind = grievance?.relatedRecord?.kind;
  if (!kind) return [];

  const types = certificateTypesAffectedBy(kind);
  if (types.length === 0) return [];

  const affected = await Certificate.find({
    studentId: grievance.studentId,
    type: { $in: types },
    status: "active",
    // Idempotence. Resolving the same grievance twice — a double-click, a
    // retried request, an admin correcting their note — must not revoke the
    // replacement this grievance just produced and mint another.
    reissuedFromGrievance: { $ne: grievance._id },
  });
  if (affected.length === 0) return [];

  const student = await User.findOne({ userId: grievance.studentId }).lean();
  if (!student) return [];

  const actions = [];
  for (const oldCert of affected) {
    try {
      const replacement = await reissueOne({ oldCert, student, actor, grievance });
      actions.push({
        oldCertId: oldCert.certId,
        newCertId: replacement.certId,
        certificateType: oldCert.type,
        action: "revoked_and_reissued",
        detail: `Reissued from the corrected ${kind}.`,
      });

      await pushNotification({
        userId: student.userId,
        type: "certificate_ready",
        priority: "high",
        title: "Your certificate has been reissued",
        message: `Your ${oldCert.type} certificate was reissued after your grievance was resolved. The earlier copy (${oldCert.certId.slice(0, 8)}…) is now marked superseded — download the new one.`,
        linkTo: "/student/certificates",
      }).catch(() => {});
    } catch (err) {
      actions.push({
        oldCertId: oldCert.certId,
        newCertId: null,
        certificateType: oldCert.type,
        action: "failed",
        detail: String(err?.message || err).slice(0, 300),
      });
    }
  }

  await AuditLog.create({
    actorId: actor.userId,
    actorRole: actor.role,
    action: "certificates_reissued_after_grievance",
    collegeId: grievance.collegeId,
    targetType: "Grievance",
    targetId: String(grievance._id),
    metadata: { recordKind: kind, actions },
  }).catch(() => {});

  return actions;
}
