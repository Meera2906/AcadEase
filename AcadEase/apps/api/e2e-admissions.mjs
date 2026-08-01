// End-to-end exercise of the TNTEU admission verification flow, run against a
// real Mongo instance and a real HTTP server.
//
// DESTRUCTIVE: it resets the APP_2025_* demo applicants, their documents, all
// admission batches and admission audit rows before running. Point it at a dev
// database only. Requires `npm run seed && npm run seed:admissions` first.
//
//   node e2e-admissions.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import { signAccessToken } from "./src/utils/jwt.js";
import { Applicant, DocumentSubmission, AdmissionBatch, User, AuditLog } from "./src/models/index.js";

const CSRF = "test-csrf-token";
const OTHER_COLLEGE = "TNTEU_COL_0912";
let base;

function tok(user) {
  return signAccessToken(user);
}

async function call(method, url, { token, body, form } = {}) {
  const headers = { cookie: `csrfToken=${CSRF}`, "x-csrf-token": CSRF };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${url}`, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, body: json };
}

let failures = 0;
function check(label, condition, extra = "") {
  if (condition) console.log(`  PASS  ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label} ${extra}`); }
}

async function main() {
  await connectDB();

  // Clean slate for the demo college.
  await Promise.all([
    Applicant.deleteMany({ applicantId: /^APP_2025_/ }),
    DocumentSubmission.deleteMany({ applicantId: /^APP_2025_/ }),
    AdmissionBatch.deleteMany({}),
    User.deleteMany({ userId: /^APP_2025_/ }),
    AuditLog.deleteMany({ action: /^admission_/ }),
  ]);

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const uniAdmin = tok({ userId: "ADM_CSE_001", role: "college_admin", collegeId: "TNTEU_COL_0417" });
  const otherUni = tok({ userId: "ADM_0912_001", role: "college_admin", collegeId: OTHER_COLLEGE });
  const tnteu = tok({ userId: "SUP_001", role: "tnteu_admin", collegeId: null });

  // ── 1. bulk applicant import ────────────────────────────────────────────
  console.log("\n1. University admin imports the applicant CSV");
  const csv = fs.readFileSync("demo-data/applicants.csv");
  const csvForm = new FormData();
  csvForm.append("file", new Blob([csv], { type: "text/csv" }), "applicants.csv");
  const imp = await call("POST", "/api/admissions/batches/applicants", { token: uniAdmin, form: csvForm });
  check("import returns 201", imp.status === 201, JSON.stringify(imp.body).slice(0, 200));
  check("7 valid rows imported", imp.body.imported === 7, `got ${imp.body.imported}`);
  check("2 bad rows rejected", imp.body.failed === 2, `got ${imp.body.failed}`);
  check("bad program reported per row", imp.body.rows.some((r) => r.errors?.some((e) => e.includes("BEd"))));
  check("quoted comma name survived CSV parse", imp.body.rows.some((r) => r.name === "Harini, Balan"));

  // ── 2. bulk document upload ─────────────────────────────────────────────
  console.log("\n2. University admin uploads 35 documents");
  const docForm = new FormData();
  const files = fs.readdirSync("demo-data/documents").sort();
  for (const f of files) {
    const buf = fs.readFileSync(path.join("demo-data/documents", f));
    const type = f.endsWith(".png") ? "image/png" : "application/pdf";
    docForm.append("files", new Blob([buf], { type }), f);
  }
  const up = await call("POST", "/api/admissions/batches/documents", { token: uniAdmin, form: docForm });
  check("upload returns 201", up.status === 201, JSON.stringify(up.body).slice(0, 300));
  check("all 35 stored", up.body.imported === 35, `got ${up.body.imported}`);
  // Five documents carry planted issues: 003's duplicated 10th marksheet
  // (duplicate_hash + name_mismatch), 004's foreign transfer certificate,
  // 005's register-number-less 12th, 005's image-only ID, 006's lapsed
  // community certificate. 001's original marksheet is not retro-flagged —
  // it was clean when it arrived; the copy is the one that gets questioned.
  check("5 documents flagged", up.body.flagged === 5, `got ${up.body.flagged}`);
  const dup = up.body.rows.find((r) => r.flags?.includes("duplicate_hash"));
  check("duplicate_hash caught across applicants", Boolean(dup), JSON.stringify(up.body.rows.filter(r=>r.flags?.length).map(r=>[r.file,r.flags])));
  check("duplicate is APP_2025_003's 10th marksheet", dup?.applicantId === "APP_2025_003");

  // ── 3. tenant isolation ─────────────────────────────────────────────────
  console.log("\n3. A different university cannot see this data");
  const foreign = await call("GET", "/api/admissions/applicants", { token: otherUni });
  // Asserting a bare zero was only true while the other college had no
  // applicants of its own — seed:governance now gives it some. What actually
  // matters is that none of *this* batch leaks across, so assert that instead:
  // it survives whatever else is in the database.
  const leaked = (foreign.body.applicants || []).filter((a) => a.applicantId?.startsWith("APP_2025_"));
  check("other university sees none of this college's applicants", leaked.length === 0,
    `leaked ${leaked.length}: ${leaked.map((a) => a.applicantId).join(", ")}`);
  check("what it does see belongs to it", (foreign.body.applicants || []).every((a) => a.collegeId === OTHER_COLLEGE),
    JSON.stringify([...new Set((foreign.body.applicants || []).map((a) => a.collegeId))]));
  const foreignDetail = await call("GET", "/api/admissions/applicants/APP_2025_001", { token: otherUni });
  check("other university gets 404 on a foreign applicant", foreignDetail.status === 404);

  const anyDoc = await DocumentSubmission.findOne({ applicantId: "APP_2025_001" }).lean();
  const foreignFile = await call("GET", `/api/admissions/documents/${anyDoc._id}/file`, { token: otherUni });
  check("other university cannot stream a foreign document", foreignFile.status === 404);

  // ── 4. stage one: the university's own queue ────────────────────────────
  console.log("\n4. The submitting university opens its stage-1 queue");
  const uniQueue = await call("GET", "/api/admissions/queue", { token: uniAdmin });
  check("queue returns 200", uniQueue.status === 200);
  check("the university is at the college stage", uniQueue.body.stage === "college", uniQueue.body.stage);
  check("queue is paginated server-side (25 of 35)", uniQueue.body.documents.length === 25 && uniQueue.body.total === 35,
    `page=${uniQueue.body.documents.length} total=${uniQueue.body.total}`);
  check("flagged documents sort first", uniQueue.body.documents[0].flagCount > 0);
  const flaggedRun = uniQueue.body.documents.findIndex((d) => d.flagCount === 0);
  check("no flagged document appears after an unflagged one",
    uniQueue.body.documents.slice(flaggedRun).every((d) => d.flagCount === 0));
  check("30 of the 35 are bulk-approvable", uniQueue.body.summary.clean === 30,
    JSON.stringify(uniQueue.body.summary));

  const flaggedOnly = await call("GET", "/api/admissions/queue?flagged=true", { token: uniAdmin });
  check("flagged filter returns exactly those 5", flaggedOnly.body.total === 5, `got ${flaggedOnly.body.total}`);

  const tnteuEmpty = await call("GET", "/api/admissions/queue", { token: tnteu });
  check("TNTEU's stage-2 queue is empty until the university approves", tnteuEmpty.body.total === 0,
    `got ${tnteuEmpty.body.total}`);

  // ── 5. review detail ────────────────────────────────────────────────────
  console.log("\n5. TNTEU opens the duplicate document");
  const dupDoc = await DocumentSubmission.findOne({ applicantId: "APP_2025_003", documentType: "10th_marksheet" }).lean();
  const detail = await call("GET", `/api/admissions/documents/${dupDoc._id}`, { token: tnteu });
  check("detail returns 200", detail.status === 200);
  check("detail names the other applicant", detail.body.duplicateOf?.applicantId === "APP_2025_001",
    JSON.stringify(detail.body.duplicateOf));
  check("detail carries the checklist", detail.body.requiredCount === 5);
  const fileRes = await fetch(`${base}/api/admissions/documents/${dupDoc._id}/file`, {
    headers: { authorization: `Bearer ${tnteu}` },
  });
  check("document streams to TNTEU", fileRes.status === 200 && fileRes.headers.get("content-type") === "application/pdf");
  check("stream is not cacheable", fileRes.headers.get("cache-control") === "private, no-store");

  // ── 6. the two-stage chain for APP_2025_001 ─────────────────────────────
  console.log("\n6. APP_2025_001's five documents pass through both stages");
  const required = ["10th_marksheet", "12th_marksheet", "ug_degree", "transfer_certificate", "id_proof"];
  const oneIds = [];
  for (const type of required) {
    const d = await DocumentSubmission.findOne({ applicantId: "APP_2025_001", documentType: type }).lean();
    oneIds.push(String(d._id));
  }

  // TNTEU cannot reach into stage one.
  const tooSoon = await call("PATCH", `/api/admissions/documents/${oneIds[0]}/verify`, { token: tnteu });
  check("TNTEU cannot verify before the university has approved", tooSoon.status === 409, `got ${tooSoon.status}`);

  const uniBulk = await call("POST", "/api/admissions/queue/bulk", {
    token: uniAdmin,
    body: { decision: "approve", documentIds: oneIds },
  });
  // 001's 10th marksheet was clean when it arrived — 003 copied it afterwards.
  // The at-approval duplicate re-check is what catches that; without it the
  // original would be swept through as clean.
  check("four are forwarded, the copied marksheet is held back",
    uniBulk.body.decidedCount === 4 && uniBulk.body.skippedCount === 1, JSON.stringify(uniBulk.body).slice(0, 220));
  check("the reviewer is told which other applicant has the same file",
    /APP_2025_003/.test(JSON.stringify(uniBulk.body.skipped)), JSON.stringify(uniBulk.body.skipped).slice(0, 200));
  check("a university approval forwards, it does not verify",
    uniBulk.body.decided.every((d) => d.outcome === "forwarded"));

  const afterStage1 = await call("GET", "/api/admissions/applicants/APP_2025_001", { token: uniAdmin });
  check("the applicant is under review, not verified", afterStage1.body.applicant.status === "under_review",
    afterStage1.body.applicant.status);

  const again = await call("POST", "/api/admissions/queue/bulk", {
    token: uniAdmin,
    body: { decision: "approve", documentIds: oneIds },
  });
  check("the university cannot approve the same documents twice", again.body.decidedCount === 0 && again.body.skippedCount === 5,
    JSON.stringify(again.body).slice(0, 200));

  // The reviewer opens the duplicate, sees both copies, and approves the
  // original individually. Bulk still refuses it; only a human can resolve it.
  const stillBulk = await call("POST", "/api/admissions/queue/bulk", {
    token: uniAdmin, body: { decision: "approve", documentIds: [oneIds[0]] },
  });
  check("bulk keeps refusing the duplicated file even after it is flagged", stillBulk.body.decidedCount === 0);
  const resolved = await call("PATCH", `/api/admissions/documents/${oneIds[0]}/verify`, { token: uniAdmin });
  check("a reviewer can approve the genuine copy individually", resolved.status === 200,
    JSON.stringify(resolved.body).slice(0, 200));

  console.log("\n6b. TNTEU gives final approval");
  const tnteuQueue = await call("GET", "/api/admissions/queue", { token: tnteu });
  check("TNTEU now sees the five forwarded documents", tnteuQueue.body.total === 5, `got ${tnteuQueue.body.total}`);
  check("TNTEU is shown who approved them at stage one",
    tnteuQueue.body.documents.every((d) => d.collegeReview?.by === "ADM_CSE_001"));

  for (let i = 0; i < oneIds.length; i += 1) {
    const res = await call("PATCH", `/api/admissions/documents/${oneIds[i]}/verify`, {
      token: tnteu,
      body: { extractedFields: { name: "Anjali Murugan" } },
    });
    const expected = i === oneIds.length - 1 ? "verified" : "under_review";
    check(`after ${i + 1}/5 verified applicant is "${expected}"`, res.body.applicantStatus === expected,
      `got ${res.body.applicantStatus}`);
  }

  const doubleSign = await DocumentSubmission.findById(oneIds[0]).lean();
  check("the document carries both counter-signatures", doubleSign.approvals?.length === 2,
    `got ${doubleSign.approvals?.length}`);
  check("stage one was signed by the university's key", doubleSign.approvals[0].keyId === "TNTEU_COL_0417");
  check("stage two was signed by TNTEU's key", doubleSign.approvals[1].keyId === "tnteu");

  // ── 7. rejection requires a reason ──────────────────────────────────────
  console.log("\n7. Rejection needs a written reason");
  const tcBad = await DocumentSubmission.findOne({ applicantId: "APP_2025_004", documentType: "transfer_certificate" }).lean();
  const noReason = await call("PATCH", `/api/admissions/documents/${tcBad._id}/reject`, { token: uniAdmin, body: { reason: "no" } });
  check("empty reason is refused", noReason.status === 400);
  const rejected = await call("PATCH", `/api/admissions/documents/${tcBad._id}/reject`, {
    token: uniAdmin,
    body: { reason: "Transfer certificate is issued to Prakash Ramalingam, not this applicant." },
  });
  check("rejection succeeds", rejected.status === 200);
  check("rejecting one document rejects the applicant", rejected.body.applicantStatus === "rejected");
  check("a stage-one rejection never reaches TNTEU",
    (await DocumentSubmission.findById(tcBad._id).lean()).reviewStage === "complete");

  // ── 8. enrolment gate ───────────────────────────────────────────────────
  console.log("\n8. Enrolment");
  const tooEarly = await call("POST", "/api/admissions/applicants/APP_2025_005/enroll", { token: uniAdmin });
  check("an unverified applicant cannot be enrolled", tooEarly.status === 400, JSON.stringify(tooEarly.body));

  const enrolled = await call("POST", "/api/admissions/applicants/APP_2025_001/enroll", { token: uniAdmin });
  check("a verified applicant enrols", enrolled.status === 201, JSON.stringify(enrolled.body));
  check("a student account is created", enrolled.body.studentUserId === "APP_2025_001");
  check("a one-time password is returned", Boolean(enrolled.body.temporaryPassword));
  const twice = await call("POST", "/api/admissions/applicants/APP_2025_001/enroll", { token: uniAdmin });
  check("enrolling twice is refused", twice.status === 409);

  // ── 9. the student's own view ───────────────────────────────────────────
  console.log("\n9. The enrolled student logs in");
  const studentTok = tok({ userId: "APP_2025_001", role: "student", collegeId: "TNTEU_COL_0417" });
  const mine = await call("GET", "/api/admissions/my-application", { token: studentTok });
  check("student sees their own application", mine.body.applicant?.applicantId === "APP_2025_001");
  check("student sees 5/5 verified", mine.body.verifiedCount === 5 && mine.body.requiredCount === 5);
  check("student sees status verified", mine.body.applicant?.status === "verified");

  const otherStudent = tok({ userId: "APP_2025_002", role: "student", collegeId: "TNTEU_COL_0417" });
  const notMine = await call("GET", "/api/admissions/my-application", { token: otherStudent });
  check("another student does not see the first one's application",
    notMine.body.applicant?.applicantId !== "APP_2025_001");
  const studentQueue = await call("GET", "/api/admissions/queue", { token: studentTok });
  check("a student cannot open the queue", studentQueue.status === 403);

  // ── 10. stats + audit ───────────────────────────────────────────────────
  console.log("\n10. Dashboard aggregation and audit trail");
  const stats = await call("GET", "/api/admissions/stats", { token: tnteu });
  check("stats returns 200", stats.status === 200);
  check("verified count is 5", stats.body.documents.verified === 5, JSON.stringify(stats.body.documents));
  check("rejected count is 1", stats.body.documents.rejected === 1);
  check("avg time to verify is computed", stats.body.avgTimeToVerifyHours !== null);
  check("per-university backlog present", stats.body.perCollege.length >= 1);
  check("throughput bucketed by day", stats.body.throughput.length >= 1);

  const scopedStats = await call("GET", "/api/admissions/stats", { token: otherUni });
  check("other university's stats are empty", scopedStats.body.documents.pending === 0,
    JSON.stringify(scopedStats.body.documents));

  const audits = await AuditLog.find({ action: /^admission_/ }).lean();
  const reviewAudits = audits.filter((a) => a.action.includes("document_") || a.action.includes("bulk_"));
  // 3 bulk sweeps + 1 individual college approval + 5 TNTEU verifies + 1 reject
  check("every decision is audited", reviewAudits.length === 10, `got ${reviewAudits.length}`);
  const rejAudit = audits.find((a) => a.action === "admission_document_rejected");
  check("audit records who, what and why",
    rejAudit?.actorId === "ADM_CSE_001" && rejAudit?.metadata?.reason?.includes("Prakash"));
  const bulkAudit = audits.find((a) => a.action === "admission_bulk_approved" && a.metadata?.decided === 4);
  check("the bulk sweep is audited with its stage and document list",
    bulkAudit?.metadata?.stage === "college" && bulkAudit?.metadata?.documentIds?.length === 4,
    JSON.stringify(bulkAudit?.metadata).slice(0, 160));

  server.close();
  await mongoose.connection.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
