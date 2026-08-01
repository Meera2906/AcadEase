// Generates a realistic bulk-submission package for the TNTEU admission demo:
// an applicant CSV plus a folder of document PDFs, some of them deliberately
// flawed so the rule-based flags fire in the verification queue.
//
//   npm run seed:admissions
//
// Output: apps/api/demo-data/  (upload these through the University Admin
// "Bulk Submission" page — nothing is written straight into the DB, so the
// demo exercises the real import path.)
import "dotenv/config";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import connectDB from "../config/db.js";
import { College, User } from "../models/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../demo-data");
const DOC_DIR = path.join(OUT_DIR, "documents");

const HOST_COLLEGE = "TNTEU_COL_0417";
const SECOND_COLLEGE = "TNTEU_COL_0912";

function renderPdf(title, fields) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("GOVERNMENT OF TAMIL NADU", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(13).text(title.toUpperCase(), { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(11);
    Object.entries(fields).forEach(([label, value]) => {
      doc.text(`${label}: ${value}`);
      doc.moveDown(0.5);
    });

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#666").text("Specimen document generated for the AcadEase demo dataset.", { align: "center" });
    doc.end();
  });
}

// A 1x1 PNG — stands in for a phone-camera scan with no text layer, which is
// what the `unreadable` flag exists to catch.
const SCAN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const APPLICANTS = [
  { applicantId: "APP_2025_001", name: "Anjali Murugan",   program: "BEd", dob: "14-03-2002", gender: "F", email: "anjali.murugan@example.com", phone: "9840012001", rollNumber: "KCE2025001", category: "BC" },
  { applicantId: "APP_2025_002", name: "Bharath Selvan",   program: "BEd", dob: "02-07-2001", gender: "M", email: "bharath.selvan@example.com", phone: "9840012002", rollNumber: "KCE2025002", category: "MBC" },
  { applicantId: "APP_2025_003", name: "Chithra Devi",     program: "BEd", dob: "29-11-2002", gender: "F", email: "chithra.devi@example.com",   phone: "9840012003", rollNumber: "KCE2025003", category: "SC" },
  { applicantId: "APP_2025_004", name: "Dinesh Kumar",     program: "BEd", dob: "18-01-2000", gender: "M", email: "dinesh.kumar@example.com",   phone: "9840012004", rollNumber: "KCE2025004", category: "OC" },
  { applicantId: "APP_2025_005", name: "Elakkiya Ravi",    program: "BEd", dob: "06-09-2003", gender: "F", email: "elakkiya.ravi@example.com",  phone: "9840012005", rollNumber: "KCE2025005", category: "BC" },
  { applicantId: "APP_2025_006", name: "Farhan Abbas",     program: "BEd", dob: "23-05-2001", gender: "M", email: "farhan.abbas@example.com",   phone: "9840012006", rollNumber: "KCE2025006", category: "BCM" },
  { applicantId: "APP_2025_007", name: "Gayathri Nathan",  program: "MEd", dob: "11-12-1999", gender: "F", email: "gayathri.nathan@example.com", phone: "9840012007", rollNumber: "KCE2025007", category: "BC" },
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv() {
  const headers = ["applicantId", "name", "program", "dob", "gender", "email", "phone", "rollNumber", "category"];
  const lines = [headers.join(",")];

  APPLICANTS.forEach((applicant) => {
    lines.push(headers.map((header) => csvCell(applicant[header])).join(","));
  });

  // Two deliberately bad rows so the import report has something to report.
  lines.push('APP_2025_008,"Harini, Balan",BSc,05-05-2002,F,harini.balan@example.com,9840012008,KCE2025008,BC');
  lines.push(",Missing Id Row,BEd,01-01-2002,M,noid@example.com,9840012009,KCE2025009,OC");

  return `${lines.join("\n")}\n`;
}

async function writeDocuments() {
  await fs.promises.mkdir(DOC_DIR, { recursive: true });
  const written = [];

  const write = async (applicantId, documentType, buffer, ext = "pdf") => {
    const file = path.join(DOC_DIR, `${applicantId}__${documentType}.${ext}`);
    await fs.promises.writeFile(file, buffer);
    written.push(path.basename(file));
  };

  const marksheet = (name, level, register, year, extra = {}) =>
    renderPdf(`${level} Standard Marksheet`, {
      "Candidate Name": name,
      "Register Number": register,
      "Year of Passing": year,
      Board: "Tamil Nadu State Board",
      Percentage: extra.percentage ?? "82.40",
      ...extra.fields,
    });

  const ugDegree = (name, year) =>
    renderPdf("Bachelor Degree Certificate", {
      "Candidate Name": name,
      University: "Bharathiar University",
      Degree: "B.Sc. Mathematics",
      "Year of Passing": year,
    });

  const bedDegree = (name, year) =>
    renderPdf("B.Ed Degree Certificate", {
      "Candidate Name": name,
      University: "Tamil Nadu Teachers Education University",
      Degree: "Bachelor of Education",
      "Year of Passing": year,
    });

  const transferCert = (name, issueDate) =>
    renderPdf("Transfer Certificate", {
      "Candidate Name": name,
      "Date of Issue": issueDate,
      Institution: "Government Higher Secondary School, Erode",
      Conduct: "Good",
    });

  const idProof = (name, idNumber, dob) =>
    renderPdf("Government Identity Proof", {
      "Candidate Name": name,
      "Aadhaar Number": idNumber,
      "Date of Birth": dob,
    });

  // ── APP_2025_001 — fully clean; this is the applicant to verify on stage ──
  const anjali10th = await marksheet("Anjali Murugan", "Tenth", "1024578901", "2018");
  await write("APP_2025_001", "10th_marksheet", anjali10th);
  await write("APP_2025_001", "12th_marksheet", await marksheet("Anjali Murugan", "Twelfth", "2024578901", "2020"));
  await write("APP_2025_001", "ug_degree", await ugDegree("Anjali Murugan", "2023"));
  await write("APP_2025_001", "transfer_certificate", await transferCert("Anjali Murugan", "12-06-2023"));
  await write("APP_2025_001", "id_proof", await idProof("Anjali Murugan", "4821 7734 9910", "14-03-2002"));

  // ── APP_2025_002 — clean second applicant ──
  await write("APP_2025_002", "10th_marksheet", await marksheet("Bharath Selvan", "Tenth", "1024578902", "2017"));
  await write("APP_2025_002", "12th_marksheet", await marksheet("Bharath Selvan", "Twelfth", "2024578902", "2019"));
  await write("APP_2025_002", "ug_degree", await ugDegree("Bharath Selvan", "2022"));
  await write("APP_2025_002", "transfer_certificate", await transferCert("Bharath Selvan", "20-05-2022"));
  await write("APP_2025_002", "id_proof", await idProof("Bharath Selvan", "7712 4409 5583", "02-07-2001"));

  // ── APP_2025_003 — byte-identical 10th marksheet to APP_2025_001 ──
  // Same SHA-256 → duplicate_hash. This is the headline fraud catch.
  await write("APP_2025_003", "10th_marksheet", anjali10th);
  await write("APP_2025_003", "12th_marksheet", await marksheet("Chithra Devi", "Twelfth", "2024578903", "2020"));
  await write("APP_2025_003", "ug_degree", await ugDegree("Chithra Devi", "2023"));
  await write("APP_2025_003", "transfer_certificate", await transferCert("Chithra Devi", "08-06-2023"));
  await write("APP_2025_003", "id_proof", await idProof("Chithra Devi", "9083 1120 4471", "29-11-2002"));

  // ── APP_2025_004 — transfer certificate carries someone else's name ──
  await write("APP_2025_004", "10th_marksheet", await marksheet("Dinesh Kumar", "Tenth", "1024578904", "2016"));
  await write("APP_2025_004", "12th_marksheet", await marksheet("Dinesh Kumar", "Twelfth", "2024578904", "2018"));
  await write("APP_2025_004", "ug_degree", await ugDegree("Dinesh Kumar", "2021"));
  await write("APP_2025_004", "transfer_certificate", await transferCert("Prakash Ramalingam", "15-04-2021"));
  await write("APP_2025_004", "id_proof", await idProof("Dinesh Kumar", "3345 8890 1276", "18-01-2000"));

  // ── APP_2025_005 — 12th has no register number; ID proof is a bare scan;
  //     transfer certificate never submitted at all ──
  await write("APP_2025_005", "10th_marksheet", await marksheet("Elakkiya Ravi", "Tenth", "1024578905", "2019"));
  await write(
    "APP_2025_005",
    "12th_marksheet",
    await renderPdf("Twelfth Standard Marksheet", {
      "Candidate Name": "Elakkiya Ravi",
      "Year of Passing": "2021",
      Board: "Tamil Nadu State Board",
      Percentage: "76.10",
    })
  );
  await write("APP_2025_005", "ug_degree", await ugDegree("Elakkiya Ravi", "2024"));
  await write("APP_2025_005", "id_proof", SCAN_PNG, "png");

  // ── APP_2025_006 — community certificate whose validity has lapsed ──
  await write("APP_2025_006", "10th_marksheet", await marksheet("Farhan Abbas", "Tenth", "1024578906", "2017"));
  await write("APP_2025_006", "12th_marksheet", await marksheet("Farhan Abbas", "Twelfth", "2024578906", "2019"));
  await write("APP_2025_006", "ug_degree", await ugDegree("Farhan Abbas", "2022"));
  await write("APP_2025_006", "transfer_certificate", await transferCert("Farhan Abbas", "30-05-2022"));
  await write("APP_2025_006", "id_proof", await idProof("Farhan Abbas", "5567 2231 8890", "23-05-2001"));
  await write(
    "APP_2025_006",
    "community_certificate",
    await renderPdf("Community Certificate", {
      "Candidate Name": "Farhan Abbas",
      Community: "Backward Class (Muslim)",
      "Date of Issue": "10-02-2019",
      "Valid Until": "09-02-2022",
    })
  );

  // ── APP_2025_007 — MEd applicant, full clean set for the MEd checklist ──
  await write("APP_2025_007", "10th_marksheet", await marksheet("Gayathri Nathan", "Tenth", "1024578907", "2015"));
  await write("APP_2025_007", "12th_marksheet", await marksheet("Gayathri Nathan", "Twelfth", "2024578907", "2017"));
  await write("APP_2025_007", "ug_degree", await ugDegree("Gayathri Nathan", "2020"));
  await write("APP_2025_007", "bed_degree", await bedDegree("Gayathri Nathan", "2022"));
  await write("APP_2025_007", "id_proof", await idProof("Gayathri Nathan", "6690 3312 7745", "11-12-1999"));

  return written;
}

// A second university with its own admin, so the tenant boundary is something
// you can actually demonstrate rather than assert.
async function ensureSecondUniversityAdmin() {
  const college = await College.findOne({ collegeId: SECOND_COLLEGE }).lean();
  if (!college) {
    console.log(`[seed:admissions] ${SECOND_COLLEGE} not found — run "npm run seed" first`);
    return;
  }

  const existing = await User.findOne({ userId: "ADM_0912_001" }).lean();
  if (existing) {
    console.log("[seed:admissions] second university admin already present (ADM_0912_001)");
    return;
  }

  await User.create({
    userId: "ADM_0912_001",
    role: "college_admin",
    name: "Mr. S. Anbarasan",
    email: "office@sankara-tt.ac.in",
    passwordHash: await bcrypt.hash("Demo@2025", 12),
    collegeId: SECOND_COLLEGE,
    institutionId: SECOND_COLLEGE,
    departmentId: "CSE_2024",
    designation: "College Office",
    isActive: true,
    totpEnabled: false,
  });
  console.log("[seed:admissions] created ADM_0912_001 / Demo@2025 for Sankara Teacher Training College");
}

async function main() {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });

  const csv = buildCsv();
  await fs.promises.writeFile(path.join(OUT_DIR, "applicants.csv"), csv, "utf8");

  const files = await writeDocuments();

  await fs.promises.writeFile(
    path.join(OUT_DIR, "README.md"),
    [
      "# AcadEase — admission verification demo package",
      "",
      "Upload these through **University Admin → Bulk Submission**. Nothing here is",
      "pre-inserted into the database: the demo runs the real import and hashing path.",
      "",
      "## Step 1 — applicants.csv",
      `${APPLICANTS.length} valid rows plus 2 deliberately broken rows (unsupported program,`,
      "missing applicantId) so the per-row import report has failures to show.",
      "",
      "## Step 2 — documents/",
      `${files.length} files, named \`<applicantId>__<documentType>.<ext>\` so the server can`,
      "match each file to its applicant. Planted issues:",
      "",
      "| Applicant | Planted issue | Flag raised |",
      "| --- | --- | --- |",
      "| APP_2025_003 | 10th marksheet is a byte-for-byte copy of APP_2025_001's | `duplicate_hash` |",
      "| APP_2025_004 | Transfer certificate is issued to a different person | `name_mismatch` |",
      "| APP_2025_005 | 12th marksheet has no register number | `missing_field` |",
      "| APP_2025_005 | ID proof is an image scan with no text layer | `unreadable` |",
      "| APP_2025_005 | Transfer certificate never submitted | checklist stays 4/5 |",
      "| APP_2025_006 | Community certificate lapsed in 2022 | `expired_document` |",
      "",
      "APP_2025_001, APP_2025_002 and APP_2025_007 (M.Ed) are clean — use APP_2025_001",
      "for the verify → enrol → signed certificate walkthrough.",
      "",
      "None of these flags reject anything on their own. They only reorder the queue",
      "so the reviewer sees the questionable documents first.",
      "",
    ].join("\n"),
    "utf8"
  );

  console.log(`[seed:admissions] wrote ${OUT_DIR}`);
  console.log(`[seed:admissions]   applicants.csv (${APPLICANTS.length} valid + 2 bad rows)`);
  console.log(`[seed:admissions]   documents/ (${files.length} files)`);

  if (process.env.MONGO_URI || process.env.MONGODB_URI) {
    await connectDB();
    await ensureSecondUniversityAdmin();
    await mongoose.connection.close();
  } else {
    console.log("[seed:admissions] no MONGO_URI set — skipped second-university admin");
  }
}

main().catch((err) => {
  console.error("[seed:admissions] failed:", err);
  process.exit(1);
});
