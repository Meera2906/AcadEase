// End-to-end exercise of the grievance → certificate revoke-and-reissue path:
//
//   a student disputes a published result → the college corrects the record and
//   resolves the grievance → every certificate that was issued *from* that
//   record is revoked as "superseded" and reissued with a fresh signature →
//   the old QR still resolves, and tells the scanner what replaced it.
//
// Also asserts the negatives, which are the point: a grievance that names no
// record, and a resolution where the record was only explained rather than
// changed, must leave every certificate untouched.
//
// DESTRUCTIVE: resets the E2E student's certificates, grievances and results.
// Dev database only. Run `npm run seed` first.
//
//   node e2e-grievance-reissue.mjs
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import { signAccessToken } from "./src/utils/jwt.js";
import {
  CertificateRequest, Certificate, Grievance, User, Result, AuditLog,
} from "./src/models/index.js";

const COLLEGE = "TNTEU_COL_0417";
const STUDENT = "STU_E2E_REISSUE";
const DEPARTMENT = "CSE_2024";
const CSRF = "e2e-csrf";

let base;
let failures = 0;
function check(label, condition, extra = "") {
  if (condition) console.log(`  PASS  ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label} ${extra}`); }
}

async function call(method, url, { token, body } = {}) {
  const headers = { cookie: `csrfToken=${CSRF}`, "x-csrf-token": CSRF };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (body) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${base}${url}`, { method, headers, body: payload });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 160) }; }
  return { status: res.status, body: json };
}

async function main() {
  await connectDB();
  await Promise.all([
    CertificateRequest.deleteMany({ studentId: STUDENT }),
    Certificate.deleteMany({ studentId: STUDENT }),
    Grievance.deleteMany({ studentId: STUDENT }),
    Result.deleteMany({ studentId: STUDENT }),
    User.deleteMany({ userId: STUDENT }),
    AuditLog.deleteMany({ action: "certificates_reissued_after_grievance" }),
  ]);

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  await User.create({
    userId: STUDENT,
    role: "student",
    name: "Reissue Test Student",
    email: "reissue.e2e@tnteu.ac.in",
    passwordHash: await bcrypt.hash("Demo@2025", 12),
    collegeId: COLLEGE,
    institutionId: COLLEGE,
    departmentId: DEPARTMENT,
    semester: 5,
    batchYear: 2021,
    enrollmentNumber: "TNTEU21CSE2E",
    isActive: true,
  });

  // A published result strong enough to earn a merit certificate.
  const result = await Result.create({
    collegeId: COLLEGE,
    studentId: STUDENT,
    semester: 5,
    academicYear: "2024-2025",
    subjects: [
      { courseId: "CS301", courseName: "Algorithms", marksObtained: 82, maxMarks: 100, result: "pass" },
      { courseId: "CS302", courseName: "Databases", marksObtained: 88, maxMarks: 100, result: "pass" },
    ],
    enteredBy: "FAC_CSE_001",
    status: "published",
  });

  const student = signAccessToken({ userId: STUDENT, role: "student", collegeId: COLLEGE, departmentId: DEPARTMENT });
  const uniAdmin = signAccessToken({ userId: "ADM_CSE_001", role: "college_admin", collegeId: COLLEGE, departmentId: DEPARTMENT });
  const tnteu = signAccessToken({ userId: "SUP_001", role: "tnteu_admin", collegeId: null });

  // ═══════════════════════════════════════════════════════════════════════
  console.log("\nSETUP: a merit certificate is issued through the two-stage chain");
  // ═══════════════════════════════════════════════════════════════════════

  const requested = await call("POST", "/api/certificates/request", {
    token: student, body: { type: "merit", purpose: "Scholarship application" },
  });
  check("the student can request a merit certificate", requested.status === 201,
    JSON.stringify(requested.body).slice(0, 200));
  const requestId = requested.body?.request?._id;

  const stage1 = await call("PATCH", `/api/certificates/request/${requestId}/approve`, {
    token: uniAdmin, body: { remarks: "Marks verified against the published result." },
  });
  check("the university approves stage 1", stage1.status === 200, JSON.stringify(stage1.body).slice(0, 160));

  const stage2 = await call("PATCH", `/api/certificates/request/${requestId}/approve`, {
    token: tnteu, body: { remarks: "Counter-signed." },
  });
  check("TNTEU counter-signs and the certificate is issued", stage2.status === 200 && stage2.body.certificate,
    JSON.stringify(stage2.body).slice(0, 160));

  const originalCertId = stage2.body.certificate.certId;
  const beforeVerify = await call("GET", `/api/certificates/verify/${originalCertId}`);
  check("the fresh certificate verifies publicly", beforeVerify.body.verified === true,
    JSON.stringify(beforeVerify.body).slice(0, 200));

  // ═══════════════════════════════════════════════════════════════════════
  console.log("\nNEGATIVE: a grievance naming no record touches nothing");
  // ═══════════════════════════════════════════════════════════════════════

  const unrelated = await call("POST", "/api/grievances", {
    token: student,
    body: { category: "Infrastructure", subject: "Projector broken in Lab 2", description: "The projector has been out for two weeks." },
  });
  check("an infrastructure grievance is accepted", unrelated.status === 201);
  const unrelatedId = unrelated.body.grievance._id;

  const unrelatedImpact = await call("GET", `/api/grievances/${unrelatedId}/certificate-impact`, { token: uniAdmin });
  check("it reports no certificate impact", unrelatedImpact.body.certificates?.length === 0);

  await call("PATCH", `/api/grievances/${unrelatedId}/acknowledge`, { token: uniAdmin });
  const unrelatedResolved = await call("PATCH", `/api/grievances/${unrelatedId}/resolve`, {
    token: uniAdmin, body: { resolutionNote: "Projector replaced.", recordCorrected: true },
  });
  check("resolving it reissues nothing, even with recordCorrected set",
    (unrelatedResolved.body.certificateActions || []).length === 0);

  const stillValid = await call("GET", `/api/certificates/verify/${originalCertId}`);
  check("the merit certificate is untouched", stillValid.body.verified === true);

  // ═══════════════════════════════════════════════════════════════════════
  console.log("\nNEGATIVE: explaining a mark, without changing it, reissues nothing");
  // ═══════════════════════════════════════════════════════════════════════

  const explained = await call("POST", "/api/grievances", {
    token: student,
    body: {
      category: "Academic",
      subject: "Semester 5 total looks wrong",
      description: "I believe my Databases mark was added up incorrectly.",
      relatedRecord: { kind: "result", resultId: String(result._id), semester: 5, academicYear: "2024-2025" },
    },
  });
  check("an academic grievance can name the result it disputes",
    explained.status === 201 && explained.body.grievance.relatedRecord?.kind === "result",
    JSON.stringify(explained.body).slice(0, 200));
  const explainedId = explained.body.grievance._id;

  const impact = await call("GET", `/api/grievances/${explainedId}/certificate-impact`, { token: uniAdmin });
  check("the admin is warned which certificates it would affect",
    impact.body.certificates?.some((c) => c.certId === originalCertId),
    JSON.stringify(impact.body).slice(0, 200));
  check("only record-derived types are listed",
    impact.body.affectedTypes?.includes("merit") && !impact.body.affectedTypes?.includes("bonafide"),
    JSON.stringify(impact.body.affectedTypes));

  await call("PATCH", `/api/grievances/${explainedId}/acknowledge`, { token: uniAdmin });
  const explainedResolved = await call("PATCH", `/api/grievances/${explainedId}/resolve`, {
    token: uniAdmin, body: { resolutionNote: "Re-totalled; the original mark was correct." },
  });
  check("resolving without recordCorrected reissues nothing",
    (explainedResolved.body.certificateActions || []).length === 0,
    JSON.stringify(explainedResolved.body.certificateActions));

  const stillValid2 = await call("GET", `/api/certificates/verify/${originalCertId}`);
  check("the certificate is still the valid one", stillValid2.body.verified === true);

  // ═══════════════════════════════════════════════════════════════════════
  console.log("\nFEATURE: correcting the record supersedes and reissues the certificate");
  // ═══════════════════════════════════════════════════════════════════════

  const disputed = await call("POST", "/api/grievances", {
    token: student,
    body: {
      category: "Academic",
      subject: "Databases mark entered as 88 instead of 94",
      description: "The revaluation report shows 94 for CS302 but the published result still reads 88.",
      relatedRecord: { kind: "result", resultId: String(result._id), semester: 5, academicYear: "2024-2025" },
    },
  });
  const disputedId = disputed.body.grievance._id;
  check("the student raises the disputed-mark grievance", disputed.status === 201);

  await call("PATCH", `/api/grievances/${disputedId}/acknowledge`, { token: uniAdmin });

  // The college actually corrects the record before resolving.
  await Result.updateOne(
    { _id: result._id, "subjects.courseId": "CS302" },
    { $set: { "subjects.$.marksObtained": 94 } }
  );

  const resolved = await call("PATCH", `/api/grievances/${disputedId}/resolve`, {
    token: uniAdmin,
    body: { resolutionNote: "Revaluation applied: CS302 corrected from 88 to 94.", recordCorrected: true },
  });
  check("the resolution succeeds", resolved.status === 200, JSON.stringify(resolved.body).slice(0, 200));

  const actions = resolved.body.certificateActions || [];
  check("exactly one certificate was acted on", actions.length === 1, JSON.stringify(actions));
  const action = actions[0] || {};
  check("it was revoked and reissued, not merely revoked", action.action === "revoked_and_reissued", action.action);
  check("the action names the certificate it replaced", action.oldCertId === originalCertId);
  const newCertId = action.newCertId;
  check("a replacement certId was produced", Boolean(newCertId) && newCertId !== originalCertId);

  // ── The old certificate ────────────────────────────────────────────────
  const oldVerify = await call("GET", `/api/certificates/verify/${originalCertId}`);
  check("the old QR still resolves rather than 404ing", oldVerify.status === 200);
  check("the old certificate no longer verifies as valid", oldVerify.body.verified === false);
  check("it is reported as superseded, not withdrawn", oldVerify.body.superseded === true,
    JSON.stringify({ status: oldVerify.body.status, type: oldVerify.body.revocationType }));
  check("it points the scanner at the replacement", oldVerify.body.supersededBy === newCertId,
    `${oldVerify.body.supersededBy}`);
  check("its message explains why", /superseded/i.test(oldVerify.body.message || ""), oldVerify.body.message);

  // ── The new certificate ────────────────────────────────────────────────
  const newVerify = await call("GET", `/api/certificates/verify/${newCertId}`);
  check("the replacement verifies as valid", newVerify.body.verified === true,
    JSON.stringify(newVerify.body).slice(0, 220));
  check("its HMAC signature is its own, and valid", newVerify.body.signatureValid === true);
  check("the approval chain still verifies end to end", newVerify.body.chainValid === true,
    JSON.stringify(newVerify.body.approvals?.map((a) => [a.stage, a.signatureValid])));
  check("the replacement records what it supersedes", newVerify.body.supersedes === originalCertId);
  check("the chain carries the original university approval, not just the reissue",
    (newVerify.body.approvals || []).some((a) => a.stage === "college_review"),
    JSON.stringify((newVerify.body.approvals || []).map((a) => a.stage)));
  check("the reissue itself is a signed link on that chain",
    (newVerify.body.approvals || []).some((a) => a.stage === "reissued" && a.signatureValid === true),
    JSON.stringify((newVerify.body.approvals || []).map((a) => [a.stage, a.signatureValid])));

  // ── Stored state ───────────────────────────────────────────────────────
  const oldRow = await Certificate.findOne({ certId: originalCertId }).lean();
  const newRow = await Certificate.findOne({ certId: newCertId }).lean();
  check("the old row is revoked with type 'superseded'",
    oldRow.status === "revoked" && oldRow.revocationType === "superseded");
  check("the old row was not edited — its snapshot is intact", oldRow.hmacSignature?.length > 0);
  check("the new row is active", newRow.status === "active");
  check("the new row has its own PDF", Boolean(newRow.pdfPath) && newRow.pdfPath !== oldRow.pdfPath);
  check("the new row is traceable to the grievance", String(newRow.reissuedFromGrievance) === String(disputedId));

  const grievanceRow = await Grievance.findById(disputedId).lean();
  check("the grievance records what it did to the certificate",
    grievanceRow.certificateActions?.[0]?.newCertId === newCertId);

  const audit = await AuditLog.findOne({ action: "certificates_reissued_after_grievance" }).lean();
  check("an audit entry was written", Boolean(audit), "no audit row");

  // ── Idempotence ────────────────────────────────────────────────────────
  const secondResolve = await call("PATCH", `/api/grievances/${disputedId}/resolve`, {
    token: uniAdmin, body: { resolutionNote: "Duplicate press.", recordCorrected: true },
  });
  const secondActions = secondResolve.body.certificateActions || [];
  check("resolving twice does not revoke the replacement",
    secondActions.every((a) => a.oldCertId !== newCertId) || secondActions.length === 0,
    JSON.stringify(secondActions));
  const afterDouble = await call("GET", `/api/certificates/verify/${newCertId}`);
  check("the replacement is still valid after a double resolve", afterDouble.body.verified === true);

  server.close();
  await mongoose.connection.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("e2e failed:", err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
