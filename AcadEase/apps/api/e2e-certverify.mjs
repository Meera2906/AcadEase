// Verifying a certificate somebody hands you, as a file.
//
// The two checks are deliberately independent, and this test proves the gap
// between them matters: a forged printout wrapped around a genuine QR code
// passes the record check and must fail the file check.
//
// DESTRUCTIVE: resets the E2E student. Dev database only.
//
//   node e2e-certverify.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import { signAccessToken } from "./src/utils/jwt.js";
import { CertificateRequest, Certificate, User, Result } from "./src/models/index.js";

const COLLEGE = "TNTEU_COL_0417";
const STUDENT = "STU_E2E_CERTVERIFY";
const DEPARTMENT = "CSE_2024";
const CSRF = "e2e-csrf";

let base;
let failures = 0;
const check = (label, cond, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : ` ${extra}`}`);
  if (!cond) failures += 1;
};

async function call(method, url, { token, body } = {}) {
  const headers = { cookie: `csrfToken=${CSRF}`, "x-csrf-token": CSRF };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (body) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${base}${url}`, { method, headers, body: payload });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function upload(token, { buffer, filename, mimetype, certId }) {
  const form = new FormData();
  if (buffer) form.append("file", new Blob([buffer], { type: mimetype }), filename);
  if (certId) form.append("certId", certId);
  const res = await fetch(`${base}/api/certificates/verify-upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, cookie: `csrfToken=${CSRF}`, "x-csrf-token": CSRF },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  await connectDB();
  await Promise.all([
    CertificateRequest.deleteMany({ studentId: STUDENT }),
    Certificate.deleteMany({ studentId: STUDENT }),
    Result.deleteMany({ studentId: STUDENT }),
    User.deleteMany({ userId: STUDENT }),
  ]);

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  await User.create({
    userId: STUDENT,
    role: "student",
    name: "Certificate Verify Student",
    email: "certverify.e2e@tnteu.ac.in",
    passwordHash: await bcrypt.hash("Demo@2025", 12),
    collegeId: COLLEGE,
    institutionId: COLLEGE,
    departmentId: DEPARTMENT,
    semester: 5,
    batchYear: 2021,
    enrollmentNumber: "TNTEU21CVE2E",
    isActive: true,
  });

  await Result.create({
    collegeId: COLLEGE,
    studentId: STUDENT,
    semester: 5,
    academicYear: "2024-2025",
    subjects: [
      { courseId: "CS301", courseName: "Algorithms", marksObtained: 88, maxMarks: 100, result: "pass" },
      { courseId: "CS302", courseName: "Databases", marksObtained: 91, maxMarks: 100, result: "pass" },
    ],
    enteredBy: "FAC_CSE_001",
    status: "published",
  });

  const student = signAccessToken({ userId: STUDENT, role: "student", collegeId: COLLEGE, departmentId: DEPARTMENT });
  const uniAdmin = signAccessToken({ userId: "ADM_CSE_001", role: "college_admin", collegeId: COLLEGE, departmentId: DEPARTMENT });
  const tnteu = signAccessToken({ userId: "SUP_001", role: "tnteu_admin", collegeId: null });
  const faculty = signAccessToken({ userId: "FAC_CSE_001", role: "faculty", collegeId: COLLEGE, departmentId: DEPARTMENT });

  console.log("\nSETUP: issue a real certificate through the two-stage chain");
  const req = await call("POST", "/api/certificates/request", { token: student, body: { type: "merit", purpose: "Employment" } });
  check("request created", req.status === 201, JSON.stringify(req.body).slice(0, 160));
  const requestId = req.body.request._id;
  await call("PATCH", `/api/certificates/request/${requestId}/approve`, { token: uniAdmin, body: { remarks: "ok" } });
  const issued = await call("PATCH", `/api/certificates/request/${requestId}/approve`, { token: tnteu, body: { remarks: "ok" } });
  check("certificate issued", issued.status === 200 && Boolean(issued.body.certificate), JSON.stringify(issued.body).slice(0, 160));

  const certId = issued.body.certificate.certId;
  const row = await Certificate.findOne({ certId }).lean();
  check("the issued PDF was hashed and stored", Boolean(row.pdfHash), "pdfHash is null");

  const pdfPath = path.resolve(row.pdfPath);
  const genuine = fs.readFileSync(pdfPath);
  check("the stored hash matches the file on disk",
    crypto.createHash("sha256").update(genuine).digest("hex") === row.pdfHash);

  console.log("\n1. The genuine file");
  const good = await upload(faculty, { buffer: genuine, filename: "certificate.pdf", mimetype: "application/pdf" });
  check("faculty can verify by upload", good.status === 200, `${good.status} ${JSON.stringify(good.body).slice(0, 160)}`);
  check("the certId was read out of the file itself", good.body.certId === certId, `source=${good.body.referenceSource}`);
  check("read from the QR bitmap or the embedded link",
    ["qr", "pdf_link"].includes(good.body.referenceSource), `${good.body.referenceSource}`);
  check("the record verifies", good.body.verified === true, JSON.stringify(good.body).slice(0, 200));
  check("the file is reported as the exact issued PDF", good.body.fileMatch === "exact", good.body.fileMatch);
  check("the verdict says so in one line", /original file/i.test(good.body.verdict || ""), good.body.verdict);

  console.log("\n2. A forged printout carrying a genuine QR code");
  const forged = Buffer.concat([genuine, Buffer.from("\n% altered after issue\n")]);
  const bad = await upload(faculty, { buffer: forged, filename: "certificate.pdf", mimetype: "application/pdf" });
  check("the record still verifies, because the QR is genuine", bad.body.verified === true);
  check("but the file is reported as NOT the issued PDF", bad.body.fileMatch === "different", bad.body.fileMatch);
  check("the verdict tells the reader to compare by eye",
    /not the original file/i.test(bad.body.verdict || ""), bad.body.verdict);
  check("both hashes are returned so they can be compared",
    Boolean(bad.body.fileHash) && Boolean(bad.body.expectedHash) && bad.body.fileHash !== bad.body.expectedHash);

  console.log("\n3. A pasted ID, for when the QR will not scan");
  const typed = await upload(faculty, { certId });
  check("verifying by pasted certId works", typed.body.verified === true, JSON.stringify(typed.body).slice(0, 160));
  check("it records that the reference was typed", typed.body.referenceSource === "typed", typed.body.referenceSource);
  check("no file means no file verdict", typed.body.fileMatch === "not_checked", typed.body.fileMatch);

  const link = await upload(faculty, { certId: `https://acadease.example/verify/${certId}` });
  check("a full verification URL is accepted too", link.body.verified === true);

  console.log("\n4. Things that must be refused");
  const madeUp = await upload(faculty, { certId: "11111111-2222-3333-4444-555555555555" });
  check("an invented certificate ID is reported as never issued", madeUp.status === 404, `${madeUp.status}`);
  check("and named as a forgery rather than a glitch",
    /never issued|forgery/i.test(madeUp.body.message || ""), madeUp.body.message);

  const garbage = await upload(faculty, {
    buffer: Buffer.from("%PDF-1.4\nnot a certificate at all\n"),
    filename: "random.pdf",
    mimetype: "application/pdf",
  });
  check("a PDF with no certificate reference is reported unreadable", garbage.status === 422, `${garbage.status}`);
  check("and says how to proceed",
    /paste it instead|another issuer/i.test(garbage.body.detail || ""), garbage.body.detail);

  const nonsense = await upload(faculty, { certId: "not-an-id" });
  check("a malformed ID is refused", nonsense.status === 400, `${nonsense.status}`);

  const empty = await upload(faculty, {});
  check("submitting nothing is refused", empty.status === 400, `${empty.status}`);

  const asStudent = await upload(student, { certId });
  check("a student cannot use the staff upload endpoint", asStudent.status === 403, `${asStudent.status}`);

  console.log("\n5. A revoked certificate is not quietly accepted");
  await call("PATCH", `/api/certificates/${certId}/revoke`, { token: tnteu, body: { reason: "Issued in error" } });
  const revoked = await upload(faculty, { buffer: genuine, filename: "certificate.pdf", mimetype: "application/pdf" });
  check("the file still matches", revoked.body.fileMatch === "exact");
  check("but the record no longer verifies", revoked.body.verified === false);
  check("and the reason is given",
    /revoked/i.test(revoked.body.verdict || revoked.body.message || ""),
    revoked.body.verdict || revoked.body.message);

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
