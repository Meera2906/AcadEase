// End-to-end exercise of the TWO-STAGE bulk verification chain:
//
//   applicant submits → university bulk-approves the clean ones → TNTEU
//   bulk-approves → verified
//
// and, more importantly, everything that is NOT allowed to happen along the
// way: a flagged document swept through, a stage skipped, a decision made by
// the wrong institution, a file swapped on disk after upload, a signature
// lifted off one document and pasted onto another.
//
// DESTRUCTIVE: resets E2E2_* applicants and their documents. Dev database only.
// Run `npm run seed` first.
//
//   node e2e-twostage.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import { signAccessToken } from "./src/utils/jwt.js";
import { encryptDocument } from "./src/utils/documentCrypto.js";
import { verifyChain } from "./src/utils/approvalChain.js";
import { Applicant, DocumentSubmission, AuditLog } from "./src/models/index.js";

// Deliberately the college the other e2e scripts do NOT use, so this script's
// exact queue counts hold whatever else is sitting in the database.
const COLLEGE = "TNTEU_COL_0912";
const OTHER_COLLEGE = "TNTEU_COL_0417";
const SECURE_ROOT = path.resolve("secure-storage/admission-docs");
const CSRF = "test-csrf-token";

let base;
let failures = 0;
function check(label, condition, extra = "") {
  if (condition) console.log(`  PASS  ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label} ${extra}`); }
}

async function call(method, url, { token, body } = {}) {
  const headers = { cookie: `csrfToken=${CSRF}`, "x-csrf-token": CSRF };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers["content-type"] = "application/json";
  const res = await fetch(`${base}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, body: json };
}

const makePdf = (lines) =>
  new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(13).text("GOVERNMENT OF TAMIL NADU", { align: "center" }).moveDown(1);
    doc.fontSize(11);
    lines.forEach((line) => { doc.text(line); doc.moveDown(0.4); });
    doc.end();
  });

// Writes an encrypted document row straight into the store, so the test can
// control exactly which flags each document carries.
async function plant({ applicantId, collegeId, documentType, buffer, flags = [] }) {
  const { ciphertext, encryption } = encryptDocument(buffer, { collegeId });
  const storedName = `${crypto.randomUUID()}.enc`;
  const dir = path.join(SECURE_ROOT, collegeId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, storedName), ciphertext);

  return DocumentSubmission.create({
    applicantId,
    collegeId,
    documentType,
    storedName,
    filePath: `${collegeId}/${storedName}`,
    originalName: `${documentType}.pdf`,
    mimeType: "application/pdf",
    size: buffer.length,
    fileHash: crypto.createHash("sha256").update(buffer).digest("hex"),
    encryption,
    extractedFields: { name: "Test Candidate" },
    extractionSource: "pdf_text",
    typeCheck: { verdict: "match", detectedType: documentType, detail: "" },
    qrCheck: { status: "absent" },
    flags,
    flagCount: flags.length,
    queued: true,
    reviewStage: "college",
    status: "pending",
  });
}

const REQUIRED = ["10th_marksheet", "12th_marksheet", "ug_degree", "transfer_certificate", "id_proof"];

async function main() {
  await connectDB();
  await Promise.all([
    Applicant.deleteMany({ applicantId: /^E2E2_/ }),
    DocumentSubmission.deleteMany({ applicantId: /^E2E2_/ }),
    AuditLog.deleteMany({ targetId: /^E2E2_/ }),
  ]);

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  const uniAdmin = signAccessToken({ userId: "E2E2_UNI", name: "Uni Registrar", role: "college_admin", collegeId: COLLEGE });
  const otherUni = signAccessToken({ userId: "E2E2_OTHER", role: "college_admin", collegeId: OTHER_COLLEGE });
  const tnteu = signAccessToken({ userId: "E2E2_SUP", name: "TNTEU Controller", role: "tnteu_admin", collegeId: null });
  const faculty = signAccessToken({ userId: "E2E2_FAC", role: "faculty", collegeId: COLLEGE });

  // ── setup: one clean applicant, one with a planted forgery signal ────────
  console.log("\n0. Two applicants: one clean, one with a suspect document");
  await Applicant.create({
    applicantId: "E2E2_CLEAN", collegeId: COLLEGE, name: "Test Candidate", program: "BEd",
    stage: "submitted", status: "submitted", tenthPercentage: 82, twelfthPercentage: 78, ugPercentage: 71,
  });
  await Applicant.create({
    applicantId: "E2E2_DODGY", collegeId: COLLEGE, name: "Other Candidate", program: "BEd",
    stage: "submitted", status: "submitted", tenthPercentage: 80, twelfthPercentage: 75, ugPercentage: 70,
  });

  const cleanIds = [];
  for (const type of REQUIRED) {
    const doc = await plant({
      applicantId: "E2E2_CLEAN", collegeId: COLLEGE, documentType: type,
      buffer: await makePdf([`Document: ${type}`, "Candidate Name: Test Candidate", `Register Number: 90${type.length}`]),
    });
    cleanIds.push(String(doc._id));
  }

  const suspect = await plant({
    applicantId: "E2E2_DODGY", collegeId: COLLEGE, documentType: "10th_marksheet",
    buffer: await makePdf(["Candidate Name: Somebody Else", "Register Number: 1234509876"]),
    flags: ["name_mismatch", "duplicate_hash"],
  });
  const unreadable = await plant({
    applicantId: "E2E2_DODGY", collegeId: COLLEGE, documentType: "12th_marksheet",
    buffer: await makePdf(["scanned image, no text layer"]),
    flags: ["unreadable"],
  });

  // ── 1. who is allowed near the queue at all ──────────────────────────────
  console.log("\n1. Only the two reviewing institutions have a queue");
  const ours = (res) => (res.body.documents || []).filter((d) => d.applicantId.startsWith("E2E2_"));

  check("faculty cannot open a review queue", (await call("GET", "/api/admissions/queue", { token: faculty })).status === 403);
  check("another university sees none of this",
    ours(await call("GET", "/api/admissions/queue?limit=100", { token: otherUni })).length === 0);

  const q1 = await call("GET", "/api/admissions/queue", { token: uniAdmin, });
  check("the university's queue is stage one", q1.body.stage === "college");
  check("all 7 documents are waiting on the university", q1.body.total === 7, `got ${q1.body.total}`);
  check("5 are clean, 1 needs a look, 1 is suspect",
    q1.body.summary.clean === 5 && q1.body.summary.attention === 1 && q1.body.summary.suspect === 1,
    JSON.stringify(q1.body.summary));
  check("TNTEU sees none of them yet",
    ours(await call("GET", "/api/admissions/queue?limit=100", { token: tnteu })).length === 0);

  // ── 2. the bulk gate ─────────────────────────────────────────────────────
  console.log("\n2. Bulk approval refuses everything the checks flagged");
  const sweep = await call("POST", "/api/admissions/queue/bulk", {
    token: uniAdmin,
    body: { decision: "approve", documentIds: [...cleanIds, String(suspect._id), String(unreadable._id)] },
  });
  check("the five clean documents are approved", sweep.body.decidedCount === 5, JSON.stringify(sweep.body).slice(0, 200));
  check("the two flagged documents are held back", sweep.body.skippedCount === 2);
  check("the reviewer is told why each was held back",
    sweep.body.skipped.every((item) => item.reasons.length > 0),
    JSON.stringify(sweep.body.skipped).slice(0, 250));
  check("the suspect document is still pending",
    (await DocumentSubmission.findById(suspect._id).lean()).status === "pending");
  check("the suspect document did not advance a stage",
    (await DocumentSubmission.findById(suspect._id).lean()).reviewStage === "college");

  const allEligible = await call("POST", "/api/admissions/queue/bulk", {
    token: uniAdmin, body: { decision: "approve", scope: "all_eligible" },
  });
  check("sweeping 'all clean' finds nothing left to sweep", allEligible.body.decidedCount === 0,
    JSON.stringify(allEligible.body).slice(0, 160));

  // ── 3. stage isolation ───────────────────────────────────────────────────
  console.log("\n3. Neither institution can act at the other's stage");
  const q2 = await call("GET", "/api/admissions/queue?limit=100", { token: tnteu });
  check("TNTEU now sees exactly the five forwarded documents", ours(q2).length === 5, `got ${ours(q2).length}`);
  check("the university's own queue has only the two flagged left",
    (await call("GET", "/api/admissions/queue", { token: uniAdmin })).body.total === 2);

  const reApprove = await call("PATCH", `/api/admissions/documents/${cleanIds[0]}/verify`, { token: uniAdmin });
  check("the university cannot touch a document it has already forwarded", reApprove.status === 409, `got ${reApprove.status}`);

  const tnteuOnFlagged = await call("PATCH", `/api/admissions/documents/${suspect._id}/verify`, { token: tnteu });
  check("TNTEU cannot verify a document the university has not approved", tnteuOnFlagged.status === 409);

  const foreignBulk = await call("POST", "/api/admissions/queue/bulk", {
    token: otherUni, body: { decision: "approve", documentIds: cleanIds },
  });
  check("a different university's bulk call decides nothing", foreignBulk.body.decidedCount === 0,
    JSON.stringify(foreignBulk.body).slice(0, 160));

  // ── 4. tampering with the stored file after upload ───────────────────────
  console.log("\n4. A file swapped on disk after the university approved it");
  const target = await DocumentSubmission.findById(cleanIds[0]).lean();
  const swapped = encryptDocument(await makePdf(["A COMPLETELY DIFFERENT DOCUMENT"]), { collegeId: COLLEGE });
  fs.writeFileSync(path.join(SECURE_ROOT, target.filePath), swapped.ciphertext);
  await DocumentSubmission.updateOne(
    { _id: target._id },
    { $set: { "encryption.iv": swapped.encryption.iv, "encryption.authTag": swapped.encryption.authTag, "encryption.wrappedKeys": swapped.encryption.wrappedKeys } }
  );

  const tampered = await call("PATCH", `/api/admissions/documents/${cleanIds[0]}/verify`, { token: tnteu });
  check("TNTEU's approval is refused on the swapped file", tampered.status === 409, JSON.stringify(tampered.body).slice(0, 200));
  check("the reviewer is told the file no longer matches its upload hash",
    /does not match the hash/i.test(JSON.stringify(tampered.body)), JSON.stringify(tampered.body).slice(0, 200));
  const flaggedNow = await DocumentSubmission.findById(cleanIds[0]).lean();
  check("the document is permanently flagged as failing integrity",
    flaggedNow.flags.includes("integrity_failed") && flaggedNow.integrityOk === false);
  const tnteuQueueAfter = await call("GET", "/api/admissions/queue?limit=100", { token: tnteu });
  check("it is no longer offered for bulk approval either",
    tnteuQueueAfter.body.documents.find((d) => d._id === cleanIds[0])?.bulkEligible === false);
  check("and it is shown as suspect, not merely flagged",
    tnteuQueueAfter.body.documents.find((d) => d._id === cleanIds[0])?.severity === "suspect");

  // ── 5. TNTEU's final approval ────────────────────────────────────────────
  console.log("\n5. TNTEU gives final approval to the rest");
  const remaining = cleanIds.slice(1);
  const finalSweep = await call("POST", "/api/admissions/queue/bulk", {
    token: tnteu, body: { decision: "approve", documentIds: remaining },
  });
  check("TNTEU verifies the remaining four", finalSweep.body.decidedCount === 4, JSON.stringify(finalSweep.body).slice(0, 200));
  check("TNTEU's approval is what marks them verified",
    finalSweep.body.decided.every((d) => d.outcome === "verified"));
  check("the applicant is NOT fully verified while one document is stuck",
    (await Applicant.findOne({ applicantId: "E2E2_CLEAN" }).lean()).status !== "verified");

  // ── 6. the signature chain ───────────────────────────────────────────────
  console.log("\n6. Each decision is counter-signed and the chain is checkable");
  const chained = await DocumentSubmission.findById(remaining[0]).lean();
  check("two links, university then TNTEU", chained.approvals.length === 2);
  check("the university signed with its own key", chained.approvals[0].keyId === COLLEGE);
  check("TNTEU signed with the TNTEU key", chained.approvals[1].keyId === "tnteu");
  check("the second link binds to the first",
    chained.approvals[1].previousSignature === chained.approvals[0].signature);

  const verified = verifyChain(chained.approvals, "DocumentSubmission", String(chained._id));
  check("the chain verifies", verified.valid, JSON.stringify(verified.links.map((l) => l.reason)));

  // Rewriting a recorded decision must break its signature.
  const forgedChain = JSON.parse(JSON.stringify(chained.approvals));
  forgedChain[0].decision = "rejected";
  check("editing a recorded decision breaks the chain",
    !verifyChain(forgedChain, "DocumentSubmission", String(chained._id)).valid);

  // Lifting TNTEU's signature onto a different document must not verify.
  check("a signature cannot be moved to another document",
    !verifyChain(chained.approvals, "DocumentSubmission", String(suspect._id)).valid);

  // Dropping the university's approval to make it look TNTEU-only must fail.
  check("removing the university's link breaks the chain",
    !verifyChain([chained.approvals[1]], "DocumentSubmission", String(chained._id)).valid);

  const detail = await call("GET", `/api/admissions/documents/${remaining[0]}`, { token: tnteu });
  check("the review screen reports the chain as valid", detail.body.approvalChain?.valid === true);

  // ── 7. bulk rejection ────────────────────────────────────────────────────
  console.log("\n7. Bulk rejection of the documents the checks caught");
  const noReason = await call("POST", "/api/admissions/queue/bulk", {
    token: uniAdmin, body: { decision: "reject", documentIds: [String(suspect._id)], reason: "no" },
  });
  check("a bulk rejection needs a written reason", noReason.status === 400);

  const bulkReject = await call("POST", "/api/admissions/queue/bulk", {
    token: uniAdmin,
    body: {
      decision: "reject",
      documentIds: [String(suspect._id), String(unreadable._id)],
      reason: "Marksheet is issued to a different candidate and the same file is already on another application.",
    },
  });
  check("both are rejected in one action", bulkReject.body.decidedCount === 2, JSON.stringify(bulkReject.body).slice(0, 200));
  const rejectedDoc = await DocumentSubmission.findById(suspect._id).lean();
  check("the rejection reason names the stage that made it",
    rejectedDoc.rejectionReason.startsWith("University review:"), rejectedDoc.rejectionReason);
  check("a rejected document is signed too", rejectedDoc.approvals.length === 1 && rejectedDoc.approvals[0].decision === "rejected");
  check("the applicant is rejected", (await Applicant.findOne({ applicantId: "E2E2_DODGY" }).lean()).status === "rejected");
  check("a rejected document never reaches TNTEU",
    (await call("GET", "/api/admissions/queue?limit=100", { token: tnteu })).body.documents.every(
      (d) => d.applicantId !== "E2E2_DODGY"
    ));

  // ── 8. audit ─────────────────────────────────────────────────────────────
  console.log("\n8. Everything is on the record");
  const audits = await AuditLog.find({ action: /^admission_(bulk|document)/ }).lean();
  const bulkAudits = audits.filter((a) => a.action.startsWith("admission_bulk"));
  check("every bulk action is audited", bulkAudits.length >= 4, `got ${bulkAudits.length}`);
  check("the audit records which stage acted",
    bulkAudits.every((a) => ["college", "tnteu"].includes(a.metadata?.stage)));

  // Leave nothing behind: a document parked at the TNTEU stage would show up
  // in the other e2e scripts' queues and fail their counts.
  const planted = await DocumentSubmission.find({ applicantId: /^E2E2_/ }).select("filePath").lean();
  planted.forEach((doc) => fs.rmSync(path.join(SECURE_ROOT, doc.filePath), { force: true }));
  await Promise.all([
    Applicant.deleteMany({ applicantId: /^E2E2_/ }),
    DocumentSubmission.deleteMany({ applicantId: /^E2E2_/ }),
    AuditLog.deleteMany({ actorId: /^E2E2_/ }),
  ]);

  server.close();
  await mongoose.connection.close();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
