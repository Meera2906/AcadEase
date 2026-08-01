// End-to-end exercise of the PRE-ADMISSION flow: applicant self-registration,
// instant document checks, encryption at rest, the eligibility gate, and the
// handover to a real student account.
//
// DESTRUCTIVE: resets APL_* / APP_E2E_* applicants and their documents.
// Dev database only. Run `npm run seed` first.
//
//   node e2e-preadmission.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import { signAccessToken } from "./src/utils/jwt.js";
import { generateCertId, signCertificate } from "./src/utils/certificate.js";
import { Applicant, DocumentSubmission, Certificate, User, AuditLog } from "./src/models/index.js";

const COLLEGE = "TNTEU_COL_0417";
const OTHER_COLLEGE = "TNTEU_COL_0912";
const SECURE_ROOT = path.resolve("secure-storage/admission-docs");

let base;
let failures = 0;
function check(label, condition, extra = "") {
  if (condition) console.log(`  PASS  ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label} ${extra}`); }
}

// ── fixtures ────────────────────────────────────────────────────────────────
const makePdf = (lines, qr) =>
  new Promise(async (resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(15).text("GOVERNMENT OF TAMIL NADU", { align: "center" }).moveDown(1);
    doc.fontSize(11);
    lines.forEach((line) => { doc.text(line); doc.moveDown(0.4); });
    if (qr) {
      const url = await QRCode.toDataURL(qr, { margin: 1, width: 220 });
      doc.image(Buffer.from(url.split(",")[1], "base64"), 60, 480, { width: 150 });
    }
    doc.end();
  });

const blankPng = (w, h) => { const p = new PNG({ width: w, height: h }); p.data.fill(255); return PNG.sync.write(p); };

// ── http helper ─────────────────────────────────────────────────────────────
const CSRF = "e2e-csrf";
async function call(method, url, { token, body, form, cookies = "" } = {}) {
  const headers = { cookie: `csrfToken=${CSRF}${cookies}`, "x-csrf-token": CSRF };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${base}${url}`, { method, headers, body: payload });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 160) }; }
  return { status: res.status, body: json, headers: res.headers };
}

function upload(token, documentType, buffer, filename, type) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), filename);
  form.append("documentType", documentType);
  return call("POST", "/api/applicant/documents", { token, form });
}

async function main() {
  await connectDB();
  await Promise.all([
    Applicant.deleteMany({ $or: [{ applicantId: /^APL_/ }, { email: /e2e-preadmission/ }] }),
    DocumentSubmission.deleteMany({ applicantId: /^APL_/ }),
    User.deleteMany({ userId: /^APL_/ }),
    Certificate.deleteMany({ studentId: "STU_E2E" }),
    AuditLog.deleteMany({ actorRole: "applicant" }),
  ]);

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  // ── 1. registration ───────────────────────────────────────────────────────
  console.log("\n1. Applicant registers for a temporary account");
  const creds = { name: "Kavya Rangan", email: "kavya.e2e-preadmission@example.com", password: "Applicant@2025", program: "BEd", collegeId: COLLEGE, dob: "09-04-2002", category: "BC" };

  const weak = await call("POST", "/api/applicant/register", { body: { ...creds, password: "short" } });
  check("a weak password is refused", weak.status === 400);
  const badCollege = await call("POST", "/api/applicant/register", { body: { ...creds, collegeId: "NOPE" } });
  check("an unknown university is refused", badCollege.status === 400);

  const reg = await call("POST", "/api/applicant/register", { body: creds });
  check("registration succeeds", reg.status === 201, JSON.stringify(reg.body).slice(0, 150));
  check("application starts as a draft", reg.body.applicant?.stage === "draft");
  const token = reg.body.accessToken;
  const applicantId = reg.body.applicant.applicantId;

  const dupe = await call("POST", "/api/applicant/register", { body: creds });
  check("registering the same email twice is refused", dupe.status === 409);

  // ── 2. the applicant token is not a staff token ───────────────────────────
  console.log("\n2. The temporary token cannot reach anything else");
  for (const [label, url] of [
    ["the verification queue", "/api/admissions/queue"],
    ["the applicant list", "/api/admissions/applicants"],
    ["admin users", "/api/admin/users"],
    ["notifications", "/api/notifications"],
  ]) {
    const res = await call("GET", url, { token });
    check(`applicant token is rejected by ${label}`, res.status === 403, `got ${res.status}`);
  }

  // ── 3. instant checks refuse bad uploads ──────────────────────────────────
  console.log("\n3. Instant checks at upload time");
  const tinyScan = blankPng(300, 400);
  const r1 = await upload(token, "10th_marksheet", tinyScan, "tenth.png", "image/png");
  check("a low-resolution scan is refused", r1.status === 422 && r1.body.stage === "quality", JSON.stringify(r1.body).slice(0, 140));
  check("the applicant is told why", /900x1100|DPI/.test(JSON.stringify(r1.body.problems)));

  const notAPdf = Buffer.alloc(80000, 7);
  const r2 = await upload(token, "10th_marksheet", notAPdf, "tenth.pdf", "application/pdf");
  check("a file that is not really a PDF is refused", r2.status === 422);

  const exe = Buffer.from("MZ\x90\x00");
  const r3 = await upload(token, "10th_marksheet", exe, "payload.exe", "application/x-msdownload");
  check("a non-document file type is refused", r3.status === 400);

  // A genuinely empty page: no text run, no image. An export that went wrong.
  const emptyPdf = await new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
  const r4 = await upload(token, "10th_marksheet", emptyPdf, "blank.pdf", "application/pdf");
  check("a blank PDF is refused", r4.status === 422, JSON.stringify(r4.body).slice(0, 140));

  // ── 4. QR authenticity ────────────────────────────────────────────────────
  console.log("\n4. QR authenticity at upload time");
  const forged = await makePdf(["Candidate Name: Kavya Rangan", "Register Number: 1024500001", "Year of Passing: 2018"],
    "http://localhost:5173/verify/11111111-2222-3333-4444-555555555555");
  const rf = await upload(token, "10th_marksheet", forged, "forged.pdf", "application/pdf");
  check("a QR pointing at a non-existent record is refused", rf.status === 422 && rf.body.stage === "authenticity",
    JSON.stringify(rf.body).slice(0, 160));

  // A genuine, signed certificate issued to somebody else.
  const certId = generateCertId();
  const signed = { certId, studentId: "STU_E2E", issuedAt: new Date(), type: "completion", institutionId: "TNTEU_001" };
  await Certificate.create({ ...signed, collegeId: COLLEGE, requestId: new mongoose.Types.ObjectId(), issuedBy: "SUP_001",
    studentName: "Someone Else Entirely", enrollmentNumber: "E9", department: "CSE", academicYear: "2024-2025",
    purpose: "e2e", hmacSignature: signCertificate(signed), status: "active", pdfPath: "x.pdf" });
  const othersCert = await makePdf(["Candidate Name: Someone Else Entirely"], `http://localhost:5173/verify/${certId}`);
  const ro = await upload(token, "ug_degree", othersCert, "ug.pdf", "application/pdf");
  check("a verified certificate belonging to another person is refused", ro.status === 422,
    JSON.stringify(ro.body).slice(0, 160));

  // Government issuer QR: accepted, but explicitly NOT called verified.
  const govt = await makePdf(["HIGHER SECONDARY EXAMINATION (HSC) - STATEMENT OF MARKS", "Candidate Name: Kavya Rangan", "Register Number: 2024500001", "Year of Passing: 2020"],
    "https://dge.tn.gov.in/verify?no=2024500001");
  const rg = await upload(token, "12th_marksheet", govt, "twelfth.pdf", "application/pdf");
  check("an issuer QR is accepted", rg.status === 201, JSON.stringify(rg.body).slice(0, 140));
  check("an issuer QR is NOT reported as verified", rg.body.qrCheck.status === "issuer_reference");
  check("the issuer link is kept for the reviewer to open", /dge\.tn\.gov\.in/.test(rg.body.qrCheck.link || ""));
  // An issuer QR is normal, not suspicious. Flagging every one of them would
  // flag the whole queue and make flagged-first ordering meaningless.
  check("an issuer QR does not raise a flag", rg.body.flags.length === 0, JSON.stringify(rg.body.flags));

  // ── 4b. The wrong file in the wrong slot ─────────────────────────────────
  // TN 10th/12th marksheets carry no QR, so the QR check contributes nothing
  // for them. Without a document-identity check, any PDF at all would sail
  // through under any heading. This is what closes that hole.
  console.log("\n4b. The document must actually be the type it was filed under");

  const realUg = await makePdf([
    "BHARATHIAR UNIVERSITY", "BACHELOR DEGREE CERTIFICATE",
    "Degree: Bachelor of Science", "Candidate Name: Kavya Rangan",
  ]);
  const wrongSlot = await upload(token, "10th_marksheet", realUg, "wrong.pdf", "application/pdf");
  check("a degree certificate filed as a 10th marksheet is refused",
    wrongSlot.status === 422 && wrongSlot.body.stage === "document_type",
    JSON.stringify(wrongSlot.body).slice(0, 160));
  check("the applicant is told which document it actually looks like",
    wrongSlot.body.detectedType === "ug_degree", JSON.stringify(wrongSlot.body.detectedType));

  const realSslc = await makePdf([
    "DIRECTORATE OF GOVERNMENT EXAMINATIONS",
    "SECONDARY SCHOOL LEAVING CERTIFICATE (SSLC) - STATEMENT OF MARKS",
    "Candidate Name: Kavya Rangan", "Register Number: 1024500001", "Year of Passing: 2018",
  ]);
  const tenthAsTwelfth = await upload(token, "12th_marksheet", realSslc, "sslc.pdf", "application/pdf");
  check("a 10th marksheet filed as a 12th marksheet is refused", tenthAsTwelfth.status === 422,
    JSON.stringify(tenthAsTwelfth.body).slice(0, 160));

  // A genuine scan we cannot read must NEVER be refused on type.
  const scanNoText = blankPng(1700, 2400);
  const unreadableScan = await upload(token, "transfer_certificate", scanNoText, "tc.png", "image/png");
  check("a genuine scan with no text layer is accepted, not refused on type",
    unreadableScan.status === 201, JSON.stringify(unreadableScan.body).slice(0, 160));
  check("it is flagged for a human instead",
    unreadableScan.body.flags.includes("type_unconfirmed"), JSON.stringify(unreadableScan.body.flags));

  // ── 4c. No QR is not reassurance ─────────────────────────────────────────
  console.log("\n4c. A missing QR hands off to the manual route");
  const sslcOk = await upload(token, "10th_marksheet", realSslc, "sslc.pdf", "application/pdf");
  check("the SSLC is accepted", sslcOk.status === 201, JSON.stringify(sslcOk.body).slice(0, 140));
  check("no QR is found on it", sslcOk.body.qrCheck.status === "absent");
  check("it does NOT say a missing QR is normal/fine",
    !/that is normal|traditional way/i.test(sslcOk.body.qrCheck.detail), sslcOk.body.qrCheck.detail);
  check("it says the QR check does not apply to this document type",
    /does not apply/i.test(sslcOk.body.qrCheck.headline), sslcOk.body.qrCheck.headline);
  check("the manual route names the issuing authority",
    /Directorate of Government Examinations/.test(sslcOk.body.verificationGuidance?.issuer || ""));
  check("the manual route links the DGE portal",
    sslcOk.body.verificationGuidance?.portal === "https://dge.tn.gov.in");
  check("the register number is extracted for the reviewer's lookup",
    sslcOk.body.verificationGuidance?.lookupValues?.registerNumber === "1024500001",
    JSON.stringify(sslcOk.body.verificationGuidance?.lookupValues));
  check("the reviewer is given concrete steps",
    (sslcOk.body.verificationGuidance?.steps || []).length >= 3);

  // ── 5. clean uploads ──────────────────────────────────────────────────────
  console.log("\n5. The remaining documents upload cleanly");
  const clean = {
    "10th_marksheet": [
      "DIRECTORATE OF GOVERNMENT EXAMINATIONS",
      "SECONDARY SCHOOL LEAVING CERTIFICATE (SSLC) - STATEMENT OF MARKS",
      "Candidate Name: Kavya Rangan", "Register Number: 1024500001", "Year of Passing: 2018",
    ],
    ug_degree: [
      "BACHELOR DEGREE CERTIFICATE", "Degree: Bachelor of Science",
      "Candidate Name: Kavya Rangan", "University: Bharathiar University", "Year of Passing: 2023",
    ],
    transfer_certificate: ["TRANSFER CERTIFICATE", "Candidate Name: Kavya Rangan", "Date of Issue: 12-06-2023"],
    id_proof: ["UNIQUE IDENTIFICATION AUTHORITY OF INDIA", "Candidate Name: Kavya Rangan", "Aadhaar Number: 5561 2093 8834"],
  };
  // pdfkit stamps a creation date, so two generations of the "same" document
  // differ byte for byte. Keep the exact buffer to test duplicate detection.
  const cleanBuffers = {};
  for (const [type, lines] of Object.entries(clean)) {
    cleanBuffers[type] = await makePdf(lines);
    const res = await upload(token, type, cleanBuffers[type], `${type}.pdf`, "application/pdf");
    check(`${type} accepted`, res.status === 201, JSON.stringify(res.body).slice(0, 140));
  }

  const dupFile = cleanBuffers["10th_marksheet"];
  const other = await call("POST", "/api/applicant/register", {
    body: { ...creds, name: "Imposter Kumar", email: "imposter.e2e-preadmission@example.com" },
  });
  const rd = await upload(other.body.accessToken, "10th_marksheet", dupFile, "same.pdf", "application/pdf");
  check("another applicant reusing the identical file is refused", rd.status === 422 && rd.body.stage === "duplicate",
    JSON.stringify(rd.body).slice(0, 140));

  // ── 6. encryption at rest ─────────────────────────────────────────────────
  console.log("\n6. Encryption at rest");
  const stored = await DocumentSubmission.findOne({ applicantId, documentType: "id_proof" }).lean();
  const onDisk = fs.readFileSync(path.join(SECURE_ROOT, stored.filePath));
  check("the stored file is not the plaintext", !onDisk.includes("Aadhaar"), "plaintext found on disk");
  check("encryption metadata is recorded", stored.encryption?.algorithm === "aes-256-gcm");
  check("a key is wrapped for TNTEU", Boolean(stored.encryption.wrappedKeys.tnteu));
  check("a key is wrapped for the owning university", Boolean(stored.encryption.wrappedKeys[COLLEGE]));
  check("no key is wrapped for anybody else", Object.keys(stored.encryption.wrappedKeys).length === 2,
    JSON.stringify(Object.keys(stored.encryption.wrappedKeys)));

  // ── 7. the eligibility gate ───────────────────────────────────────────────
  console.log("\n7. The eligibility gate");
  const early = await call("POST", "/api/applicant/submit", { token });
  check("cannot submit before declaring marks", early.status === 400, JSON.stringify(early.body).slice(0, 140));

  const short = await call("PATCH", "/api/applicant/me", { token,
    body: { tenthPercentage: 78, twelfthPercentage: 71, ugPercentage: 41 } });
  check("41% UG is not eligible for B.Ed at the 45% BC rate", short.body.eligibility.eligible === false);
  check("the shortfall is explained", /45%/.test(JSON.stringify(short.body.eligibility.blockers)),
    JSON.stringify(short.body.eligibility.blockers));

  const blocked = await call("POST", "/api/applicant/submit", { token });
  check("an ineligible application cannot be submitted", blocked.status === 400);

  const ok = await call("PATCH", "/api/applicant/me", { token, body: { ugPercentage: 47 } });
  check("47% clears the 45% reserved-category minimum", ok.body.eligibility.eligible === true,
    JSON.stringify(ok.body.eligibility.blockers));

  // ── 8. drafts stay out of the queue ───────────────────────────────────────
  console.log("\n8. Drafts do not consume reviewer attention");
  const tnteu = signAccessToken({ userId: "SUP_001", role: "tnteu_admin", collegeId: null });
  // A submitted application enters the FIRST stage of the chain: the applicant's
  // own university reviews it before TNTEU ever sees it.
  const ownUni = signAccessToken({ userId: "ADM_CSE_001", role: "college_admin", collegeId: COLLEGE });
  const before = await call("GET", "/api/admissions/queue", { token: ownUni });
  check("a draft's documents are not in the university's queue",
    !before.body.documents.some((d) => d.applicantId === applicantId),
    `${before.body.total} in queue`);

  const submitted = await call("POST", "/api/applicant/submit", { token });
  check("submission succeeds", submitted.status === 200, JSON.stringify(submitted.body).slice(0, 140));

  const after = await call("GET", "/api/admissions/queue?limit=100", { token: ownUni });
  const mine = after.body.documents.filter((d) => d.applicantId === applicantId);
  check("all 5 documents enter the university's queue on submit", mine.length === 5, `got ${mine.length}`);
  const notYetTnteu = await call("GET", "/api/admissions/queue?limit=100", { token: tnteu });
  check("TNTEU sees none of them until the university approves",
    !notYetTnteu.body.documents.some((d) => d.applicantId === applicantId));
  // Clean documents must stay unflagged so the queue's flagged-first ordering
  // keeps pointing at the ones that actually need attention.
  check("a clean submission adds no noise to the queue", mine.every((d) => d.flagCount === 0),
    JSON.stringify(mine.map((d) => [d.documentType, d.flags])));

  const locked = await upload(token, "id_proof", await makePdf(["x"]), "x.pdf", "application/pdf");
  check("a submitted application can no longer be edited", locked.status === 409, `got ${locked.status}`);

  // ── 9. who can decrypt ────────────────────────────────────────────────────
  console.log("\n9. Only TNTEU and the owning university can decrypt");
  const docId = (await DocumentSubmission.findOne({ applicantId, documentType: "id_proof" }).lean())._id;
  const asTnteu = await fetch(`${base}/api/admissions/documents/${docId}/file`, { headers: { authorization: `Bearer ${tnteu}` } });
  const tnteuBody = Buffer.from(await asTnteu.arrayBuffer());
  check("TNTEU can decrypt and read it", asTnteu.status === 200 && tnteuBody.subarray(0, 5).toString() === "%PDF-");

  const asOwn = await fetch(`${base}/api/admissions/documents/${docId}/file`, { headers: { authorization: `Bearer ${ownUni}` } });
  check("the owning university can decrypt it", asOwn.status === 200);

  const otherUni = signAccessToken({ userId: "ADM_0912_001", role: "college_admin", collegeId: OTHER_COLLEGE });
  const asOther = await call("GET", `/api/admissions/documents/${docId}/file`, { token: otherUni });
  check("another university cannot reach it at all", asOther.status === 404, `got ${asOther.status}`);

  const faculty = signAccessToken({ userId: "FAC_CSE_001", role: "faculty", collegeId: COLLEGE });
  const asFaculty = await call("GET", `/api/admissions/documents/${docId}/file`, { token: faculty });
  check("faculty cannot reach it", asFaculty.status === 403, `got ${asFaculty.status}`);

  // Tampering with the ciphertext must be caught, not silently served.
  const cipherPath = path.join(SECURE_ROOT, stored.filePath);
  const original = fs.readFileSync(cipherPath);
  const tampered = Buffer.from(original); tampered[10] ^= 0xff;
  fs.writeFileSync(cipherPath, tampered);
  const asTampered = await call("GET", `/api/admissions/documents/${docId}/file`, { token: tnteu });
  check("a tampered file is detected, not served", asTampered.status === 422, `got ${asTampered.status}`);
  fs.writeFileSync(cipherPath, original);

  // ── 10. both stages approve, then the university enrols ───────────────────
  console.log("\n10. University bulk-approves, TNTEU bulk-approves, then enrolment");
  const myDocs = await DocumentSubmission.find({ applicantId }).select("_id").lean();
  const myIds = myDocs.map((d) => String(d._id));

  const stage1 = await call("POST", "/api/admissions/queue/bulk", {
    token: ownUni, body: { decision: "approve", documentIds: myIds },
  });
  check("the university approves all 5 in one action", stage1.body.decidedCount === 5,
    JSON.stringify(stage1.body).slice(0, 200));
  const midway = await Applicant.findOne({ applicantId }).lean();
  check("a university approval alone does not verify the applicant", midway.status === "under_review", midway.status);

  const stage2 = await call("POST", "/api/admissions/queue/bulk", {
    token: tnteu, body: { decision: "approve", documentIds: myIds },
  });
  check("TNTEU gives final approval to all 5", stage2.body.decidedCount === 5,
    JSON.stringify(stage2.body).slice(0, 200));

  const refreshed = await Applicant.findOne({ applicantId }).lean();
  check("the applicant is now verified", refreshed.status === "verified", refreshed.status);

  const enrolled = await call("POST", `/api/admissions/applicants/${applicantId}/enroll`, { token: ownUni });
  check("enrolment creates a student account", enrolled.status === 201, JSON.stringify(enrolled.body).slice(0, 150));

  const afterEnrol = await Applicant.findOne({ applicantId }).lean();
  check("the temporary applicant password is destroyed", afterEnrol.passwordHash === null);
  check("the applicant is marked enrolled", afterEnrol.stage === "enrolled");

  const staleToken = await call("GET", "/api/applicant/me", { token });
  check("the old applicant token stops working", staleToken.status === 403, `got ${staleToken.status}`);

  const relogin = await call("POST", "/api/applicant/login", { body: { email: creds.email, password: creds.password } });
  check("the applicant can no longer log into the portal", relogin.status === 403 || relogin.status === 401,
    `got ${relogin.status}`);

  const student = await User.findOne({ userId: applicantId }).lean();
  check("a student User now exists", student?.role === "student");
  check("the student is scoped to the right university", student?.collegeId === COLLEGE);

  // ── 11. ineligible applicants cannot be enrolled ──────────────────────────
  console.log("\n11. The eligibility gate also guards enrolment");
  await Applicant.updateOne({ applicantId: "APP_E2E_INELIGIBLE" }, {
    $setOnInsert: { collegeId: COLLEGE, name: "Ineligible Test", program: "BEd", status: "verified", ugPercentage: 30,
      tenthPercentage: 60, twelfthPercentage: 60, category: "OC" },
  }, { upsert: true });
  const docsFor = ["10th_marksheet", "12th_marksheet", "ug_degree", "transfer_certificate", "id_proof"];
  for (const type of docsFor) {
    await DocumentSubmission.updateOne({ applicantId: "APP_E2E_INELIGIBLE", documentType: type }, {
      $setOnInsert: { collegeId: COLLEGE, storedName: "x", filePath: "x", fileHash: `h_${type}_e2e`, status: "verified" },
    }, { upsert: true });
  }
  const blockedEnrol = await call("POST", "/api/admissions/applicants/APP_E2E_INELIGIBLE/enroll", { token: ownUni });
  check("a verified but ineligible applicant cannot be enrolled", blockedEnrol.status === 400,
    JSON.stringify(blockedEnrol.body).slice(0, 160));
  check("the reason names the shortfall", /50%/.test(JSON.stringify(blockedEnrol.body.blockers)),
    JSON.stringify(blockedEnrol.body.blockers));

  // ── 12. audit ─────────────────────────────────────────────────────────────
  console.log("\n12. Audit trail");
  const audits = await AuditLog.find({ actorRole: "applicant" }).lean();
  check("registration is audited", audits.some((a) => a.action === "applicant_registered"));
  check("refused uploads are audited", audits.some((a) => a.action === "applicant_document_refused"));
  check("accepted uploads are audited", audits.some((a) => a.action === "applicant_document_uploaded"));
  check("submission is audited", audits.some((a) => a.action === "applicant_application_submitted"));

  // cleanup
  await Promise.all([
    Applicant.deleteMany({ $or: [{ applicantId: /^APL_/ }, { applicantId: "APP_E2E_INELIGIBLE" }] }),
    DocumentSubmission.deleteMany({ $or: [{ applicantId: /^APL_/ }, { applicantId: "APP_E2E_INELIGIBLE" }] }),
    User.deleteMany({ userId: /^APL_/ }),
    Certificate.deleteMany({ studentId: "STU_E2E" }),
  ]);
  server.close();
  await mongoose.connection.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
