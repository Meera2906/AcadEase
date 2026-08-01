// End-to-end exercise of the two features added last:
//   * a university applying to TNTEU (affiliation, seats, programmes)
//   * a merit certificate travelling student → university → TNTEU → student,
//     collecting a non-spoofable counter-signature at each stage
//
// DESTRUCTIVE: resets test certificate requests, university requests and the
// E2E student. Dev database only. Run `npm run seed` first.
//
//   node e2e-signedflow.mjs
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import { signAccessToken } from "./src/utils/jwt.js";
import {
  CertificateRequest, Certificate, UniversityRequest, User, Result, AuditLog,
} from "./src/models/index.js";

const COLLEGE = "TNTEU_COL_0417";
const OTHER_COLLEGE = "TNTEU_COL_0912";
const STUDENT = "STU_E2E_MERIT";
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
    UniversityRequest.deleteMany({ requestId: /^UR_/ }),
    User.deleteMany({ userId: STUDENT }),
    Result.deleteMany({ studentId: STUDENT }),
    AuditLog.deleteMany({ action: /^(certificate_stage|university_request)/ }),
  ]);

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  const uniAdmin = signAccessToken({ userId: "ADM_CSE_001", role: "college_admin", collegeId: COLLEGE, departmentId: "CSE_2024" });
  const otherUni = signAccessToken({ userId: "ADM_0912_001", role: "college_admin", collegeId: OTHER_COLLEGE });
  const tnteu = signAccessToken({ userId: "SUP_001", role: "tnteu_admin", collegeId: null });

  // ═══════════════════════════════════════════════════════════════════════
  console.log("\nFEATURE: a university applies to TNTEU");
  // ═══════════════════════════════════════════════════════════════════════

  const types = await call("GET", "/api/university-requests/types", { token: uniAdmin });
  check("the catalogue of request types is published", types.body.types?.length >= 5, `${types.body.types?.length}`);
  check("seat revision is one of them", types.body.types.some((t) => t.type === "seat_increase"));

  const created = await call("POST", "/api/university-requests", {
    token: uniAdmin,
    body: {
      type: "seat_increase",
      title: "Increase B.Ed intake from 100 to 150 for 2025-2026",
      description: "Two new method labs and six additional teaching staff were commissioned this year. Requesting a revised seat matrix accordingly.",
      academicYear: "2025-2026",
      details: { currentBedSeats: 100, requestedBedSeats: 150 },
      priority: "urgent",
    },
  });
  check("the college can raise a request", created.status === 201, JSON.stringify(created.body).slice(0, 160));
  const requestId = created.body.request.requestId;
  check("it starts as a draft", created.body.request.status === "draft");

  const thin = await call("POST", "/api/university-requests", {
    token: uniAdmin, body: { type: "seat_increase", title: "Hi", description: "Too short" },
  });
  check("a request with no real description is refused", thin.status === 400);

  const badType = await call("POST", "/api/university-requests", {
    token: uniAdmin, body: { type: "free_money", title: "Give us funds", description: "A".repeat(30) },
  });
  check("an unknown request type is refused", badType.status === 400);

  // Tenant isolation
  const foreignList = await call("GET", "/api/university-requests", { token: otherUni });
  check("another college does not see this request", !foreignList.body.requests.some((r) => r.requestId === requestId));
  const foreignGet = await call("GET", `/api/university-requests/${requestId}`, { token: otherUni });
  check("another college gets 404 fetching it directly", foreignGet.status === 404, `got ${foreignGet.status}`);

  // TNTEU should not see a draft.
  const beforeSubmit = await call("GET", "/api/university-requests?status=submitted", { token: tnteu });
  check("TNTEU does not see unsubmitted drafts",
    !beforeSubmit.body.requests.some((r) => r.requestId === requestId));

  const submitted = await call("POST", `/api/university-requests/${requestId}/submit`, { token: uniAdmin });
  check("the college submits it", submitted.status === 200, JSON.stringify(submitted.body).slice(0, 140));

  const afterSubmit = await call("GET", "/api/university-requests?status=submitted", { token: tnteu });
  check("it now appears in TNTEU's queue", afterSubmit.body.requests.some((r) => r.requestId === requestId));

  // Clarification round-trip
  const clarify = await call("PATCH", `/api/university-requests/${requestId}/clarify`, {
    token: tnteu, body: { note: "Attach the staff-to-student ratio statement for the new intake." },
  });
  check("TNTEU can ask for more information", clarify.status === 200);
  check("status reflects the clarification", clarify.body.request.status === "clarification_requested");

  const reply = await call("POST", `/api/university-requests/${requestId}/messages`, {
    token: uniAdmin, body: { body: "Ratio statement attached — 1:12 across both method labs." },
  });
  check("the college can reply in the thread", reply.status === 201 && reply.body.messages.length === 2);

  const collegeCannotDecide = await call("PATCH", `/api/university-requests/${requestId}/approve`, {
    token: uniAdmin, body: { note: "Approving our own request" },
  });
  check("a college cannot approve its own request", collegeCannotDecide.status === 403, `got ${collegeCannotDecide.status}`);

  const approvedUr = await call("PATCH", `/api/university-requests/${requestId}/approve`, {
    token: tnteu, body: { note: "Seat matrix revised to 150 for 2025-2026." },
  });
  check("TNTEU approves it", approvedUr.status === 200, JSON.stringify(approvedUr.body).slice(0, 160));
  check("a signed order is returned", Boolean(approvedUr.body.order?.keyFingerprint));
  check("the order is attributed to TNTEU", approvedUr.body.order.authority === "TNTEU");

  const finalUr = await call("GET", `/api/university-requests/${requestId}`, { token: uniAdmin });
  check("the signature on the decision verifies", finalUr.body.signatureChain.valid === true,
    JSON.stringify(finalUr.body.signatureChain.links?.map((l) => l.reason)));

  const decidedTwice = await call("PATCH", `/api/university-requests/${requestId}/reject`, {
    token: tnteu, body: { note: "Changed my mind entirely" },
  });
  check("a decided request cannot be decided again", decidedTwice.status === 409, `got ${decidedTwice.status}`);

  // Tamper with the stored decision and confirm the signature catches it.
  await UniversityRequest.updateOne({ requestId }, { $set: { "approvals.0.decision": "rejected" } });
  const tampered = await call("GET", `/api/university-requests/${requestId}`, { token: uniAdmin });
  check("flipping the stored decision breaks the signature", tampered.body.signatureChain.valid === false);
  await UniversityRequest.updateOne({ requestId }, { $set: { "approvals.0.decision": "approved" } });

  // ═══════════════════════════════════════════════════════════════════════
  console.log("\nFEATURE: merit certificate, counter-signed at each stage");
  // ═══════════════════════════════════════════════════════════════════════

  await User.create({
    userId: STUDENT, role: "student", name: "Meena Raghavan", email: "meena.e2e@example.com",
    passwordHash: await bcrypt.hash("Demo@2025", 4), collegeId: COLLEGE, institutionId: COLLEGE,
    departmentId: "CSE_2024", enrollmentNumber: "KCE2025099", batchYear: 2022, isActive: true,
  });
  const student = signAccessToken({ userId: STUDENT, role: "student", collegeId: COLLEGE, departmentId: "CSE_2024" });

  // Not eligible yet — no published results.
  const noResults = await call("POST", "/api/certificates/request", {
    token: student, body: { type: "merit", purpose: "Scholarship application" },
  });
  check("a merit certificate is refused with no published results", noResults.status === 400,
    JSON.stringify(noResults.body).slice(0, 140));

  // Publish a weak result: below the merit threshold.
  await Result.create({
    collegeId: COLLEGE, studentId: STUDENT, semester: 5, academicYear: "2024-2025", status: "published",
    enteredBy: "FAC_CSE_001",
    subjects: [
      { courseId: "CS301", courseName: "A", marksObtained: 55, maxMarks: 100, result: "pass" },
      { courseId: "CS302", courseName: "B", marksObtained: 60, maxMarks: 100, result: "pass" },
    ],
  });
  const belowBar = await call("POST", "/api/certificates/request", {
    token: student, body: { type: "merit", purpose: "Scholarship application" },
  });
  check("57.5% is below the 75% merit bar and is refused", belowBar.status === 400,
    JSON.stringify(belowBar.body).slice(0, 140));

  // Raise it above the bar.
  await Result.updateOne({ studentId: STUDENT, semester: 5 }, {
    $set: { subjects: [
      { courseId: "CS301", courseName: "A", marksObtained: 88, maxMarks: 100, result: "pass" },
      { courseId: "CS302", courseName: "B", marksObtained: 82, maxMarks: 100, result: "pass" },
    ] },
  });
  const eligibility = await call("GET", "/api/certificates/eligibility", { token: student });
  check("the student can see they now qualify", eligibility.body.merit.eligible === true,
    JSON.stringify(eligibility.body.merit));
  check("the percentage is computed from results", eligibility.body.merit.percentage === 85);

  const requested = await call("POST", "/api/certificates/request", {
    token: student, body: { type: "merit", purpose: "Scholarship application" },
  });
  check("the request is accepted", requested.status === 201, JSON.stringify(requested.body).slice(0, 140));
  const certReqId = requested.body.request._id;
  check("it starts at the university, not TNTEU", requested.body.request.stage === "college_review");

  // ── Stage ordering is enforced ──
  const skipAhead = await call("PATCH", `/api/certificates/request/${certReqId}/approve`, { token: tnteu });
  check("TNTEU cannot approve before the university has", skipAhead.status === 403, `got ${skipAhead.status}`);

  const foreignApprove = await call("PATCH", `/api/certificates/request/${certReqId}/approve`, { token: otherUni });
  check("another university cannot approve it", foreignApprove.status === 403, `got ${foreignApprove.status}`);

  // ── Stage 1: the university signs ──
  const stage1 = await call("PATCH", `/api/certificates/request/${certReqId}/approve`, {
    token: uniAdmin, body: { remarks: "Marks verified against our internal records." },
  });
  check("the university approves", stage1.status === 200, JSON.stringify(stage1.body).slice(0, 160));
  check("it moves to TNTEU", stage1.body.stage === "tnteu_review");
  check("one counter-signature is recorded", stage1.body.approvals.length === 1);
  check("signed with the college's own key", stage1.body.approvals[0].keyId === COLLEGE);
  check("no certificate exists yet", (await Certificate.countDocuments({ studentId: STUDENT })) === 0);

  const doubleApprove = await call("PATCH", `/api/certificates/request/${certReqId}/approve`, { token: uniAdmin });
  check("the university cannot approve twice", doubleApprove.status === 403, `got ${doubleApprove.status}`);

  // ── Stage 2: TNTEU counter-signs and the certificate is generated ──
  const stage2 = await call("PATCH", `/api/certificates/request/${certReqId}/approve`, {
    token: tnteu, body: { remarks: "Counter-signed by the Registrar." },
  });
  check("TNTEU counter-signs", stage2.status === 200, JSON.stringify(stage2.body).slice(0, 200));
  check("the certificate is generated automatically", Boolean(stage2.body.certificate?.certId));
  check("a PDF was written", Boolean(stage2.body.certificate?.pdfPath));

  const cert = await Certificate.findOne({ studentId: STUDENT }).lean();
  check("the chain is stored on the certificate", cert.approvalChain.length === 3, `got ${cert.approvalChain?.length}`);
  check("chain order is college → TNTEU → issued",
    cert.approvalChain.map((l) => l.stage).join(",") === "college_review,tnteu_review,issued",
    cert.approvalChain.map((l) => l.stage).join(","));
  check("the two institutions signed with different keys",
    cert.approvalChain[0].keyId === COLLEGE && cert.approvalChain[1].keyId === "tnteu");
  check("the issuer signature is recorded", Boolean(cert.issuerSignature) && cert.issuerKeyId === "tnteu");
  check("the algorithm is asymmetric, not HMAC", cert.signatureAlgorithm === "rsa-pss-sha256");

  // ── Public verification, no auth ──
  const verified = await fetch(`${base}/api/certificates/verify/${cert.certId}`).then((r) => r.json());
  check("the public page verifies it", verified.verified === true, JSON.stringify(verified).slice(0, 200));
  check("the chain verifies", verified.chainValid === true);
  check("all three signatures check out", verified.approvals.every((a) => a.signatureValid));
  check("the chain is described in plain terms",
    verified.approvals[0].label === "Approved by the university" &&
    verified.approvals[1].label === "Counter-signed by TNTEU");
  check("verification needs no login", !verified.error);

  // ── Tamper detection on the issued certificate ──
  await Certificate.updateOne({ certId: cert.certId }, { $set: { "approvalChain.0.decision": "rejected" } });
  const afterEdit = await fetch(`${base}/api/certificates/verify/${cert.certId}`).then((r) => r.json());
  check("editing an approval in the chain invalidates the certificate", afterEdit.verified === false);
  check("the reason is reported", /altered/.test(afterEdit.message), afterEdit.message);
  await Certificate.updateOne({ certId: cert.certId }, { $set: { "approvalChain.0.decision": "approved" } });

  const removed = cert.approvalChain.slice(1);
  await Certificate.updateOne({ certId: cert.certId }, { $set: { approvalChain: removed } });
  const afterRemoval = await fetch(`${base}/api/certificates/verify/${cert.certId}`).then((r) => r.json());
  check("removing the university's approval invalidates it", afterRemoval.verified === false);
  await Certificate.updateOne({ certId: cert.certId }, { $set: { approvalChain: cert.approvalChain } });

  // ── The student sees the whole journey ──
  const mine = await call("GET", `/api/certificates/requests/student/${STUDENT}`, { token: student });
  check("the student sees their issued request", mine.body.requests[0]?.stage === "issued");
  check("the student can see who signed", mine.body.requests[0]?.approvals?.length === 3);

  // ── Rejection path, at the TNTEU stage ──
  console.log("\n  rejection path");
  const second = await call("POST", "/api/certificates/request", {
    token: student, body: { type: "bonafide", purpose: "Bank loan" },
  });
  const secondId = second.body.request._id;
  await call("PATCH", `/api/certificates/request/${secondId}/approve`, { token: uniAdmin });

  const noReason = await call("PATCH", `/api/certificates/request/${secondId}/reject`, { token: tnteu, body: { reason: "no" } });
  check("a rejection without a real reason is refused", noReason.status === 400);

  const rejected = await call("PATCH", `/api/certificates/request/${secondId}/reject`, {
    token: tnteu, body: { reason: "Purpose does not match the certificate type requested." },
  });
  check("TNTEU can reject at its stage", rejected.status === 200);
  check("the stage that rejected is recorded", rejected.body.request.rejectedStage === "tnteu_review");
  check("the rejection is itself signed", rejected.body.request.approvals.length === 2);
  check("no certificate is generated", (await Certificate.countDocuments({ studentId: STUDENT })) === 1);

  // ── Audit ──
  const audits = await AuditLog.find({ action: /^(certificate_stage|university_request)/ }).lean();
  check("every stage decision is audited", audits.filter((a) => a.action.startsWith("certificate_stage")).length === 4,
    `got ${audits.filter((a) => a.action.startsWith("certificate_stage")).length}`);
  check("the university request decision is audited", audits.some((a) => a.action === "university_request_approved"));

  // cleanup
  await Promise.all([
    CertificateRequest.deleteMany({ studentId: STUDENT }),
    Certificate.deleteMany({ studentId: STUDENT }),
    UniversityRequest.deleteMany({ requestId: /^UR_/ }),
    User.deleteMany({ userId: STUDENT }),
    Result.deleteMany({ studentId: STUDENT }),
  ]);
  server.close();
  await mongoose.connection.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
