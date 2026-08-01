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
  const otherUni = tok({ userId: "ADM_0912_001", role: "college_admin", collegeId: "TNTEU_COL_0912" });
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
  check("other university sees 0 applicants", foreign.body.total === 0, `got ${foreign.body.total}`);
  const foreignDetail = await call("GET", "/api/admissions/applicants/APP_2025_001", { token: otherUni });
  check("other university gets 404 on a foreign applicant", foreignDetail.status === 404);

  const anyDoc = await DocumentSubmission.findOne({ applicantId: "APP_2025_001" }).lean();
  const foreignFile = await call("GET", `/api/admissions/documents/${anyDoc._id}/file`, { token: otherUni });
  check("other university cannot stream a foreign document", foreignFile.status === 404);

  // ── 4. the TNTEU queue ──────────────────────────────────────────────────
  console.log("\n4. TNTEU opens the queue");
  const queue = await call("GET", "/api/admissions/queue", { token: tnteu, });
  check("queue returns 200", queue.status === 200);
  check("queue is paginated server-side (25 of 35)", queue.body.documents.length === 25 && queue.body.total === 35,
    `page=${queue.body.documents.length} total=${queue.body.total}`);
  check("flagged documents sort first", queue.body.documents[0].flagCount > 0);
  const flaggedRun = queue.body.documents.findIndex((d) => d.flagCount === 0);
  check("no flagged document appears after an unflagged one",
    queue.body.documents.slice(flaggedRun).every((d) => d.flagCount === 0));

  const flaggedOnly = await call("GET", "/api/admissions/queue?flagged=true", { token: tnteu });
  check("flagged filter returns exactly those 5", flaggedOnly.body.total === 5, `got ${flaggedOnly.body.total}`);

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

  // ── 6. verify APP_2025_001 document by document ─────────────────────────
  console.log("\n6. TNTEU verifies APP_2025_001's five required documents");
  const required = ["10th_marksheet", "12th_marksheet", "ug_degree", "transfer_certificate", "id_proof"];
  for (let i = 0; i < required.length; i += 1) {
    const d = await DocumentSubmission.findOne({ applicantId: "APP_2025_001", documentType: required[i] }).lean();
    const res = await call("PATCH", `/api/admissions/documents/${d._id}/verify`, {
      token: tnteu,
      body: { extractedFields: { ...d.extractedFields, name: "Anjali Murugan" } },
    });
    const expected = i === required.length - 1 ? "verified" : "under_review";
    check(`after ${i + 1}/5 verified applicant is "${expected}"`, res.body.applicantStatus === expected,
      `got ${res.body.applicantStatus}`);
  }

  const uniOnly = await call("PATCH", `/api/admissions/documents/${anyDoc._id}/verify`, { token: uniAdmin });
  check("a university admin cannot verify documents", uniOnly.status === 403, `got ${uniOnly.status}`);

  // ── 7. rejection requires a reason ──────────────────────────────────────
  console.log("\n7. Rejection needs a written reason");
  const tcBad = await DocumentSubmission.findOne({ applicantId: "APP_2025_004", documentType: "transfer_certificate" }).lean();
  const noReason = await call("PATCH", `/api/admissions/documents/${tcBad._id}/reject`, { token: tnteu, body: { reason: "no" } });
  check("empty reason is refused", noReason.status === 400);
  const rejected = await call("PATCH", `/api/admissions/documents/${tcBad._id}/reject`, {
    token: tnteu,
    body: { reason: "Transfer certificate is issued to Prakash Ramalingam, not this applicant." },
  });
  check("rejection succeeds", rejected.status === 200);
  check("rejecting one document rejects the applicant", rejected.body.applicantStatus === "rejected");

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
  check("every review is audited", audits.filter((a) => a.action.includes("document_")).length === 6,
    `got ${audits.filter((a) => a.action.includes("document_")).length}`);
  const rejAudit = audits.find((a) => a.action === "admission_document_rejected");
  check("audit records who, what and why",
    rejAudit?.actorId === "SUP_001" && rejAudit?.metadata?.reason?.includes("Prakash"));

  server.close();
  await mongoose.connection.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
