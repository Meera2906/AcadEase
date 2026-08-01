// Wipes the admission pipeline back to empty so a demo (or a fresh import of
// demo-data/applicants.csv) starts clean.
//
// The e2e scripts and earlier demo runs leave their applicants behind on
// purpose — you usually want to look at the result in the UI afterwards. The
// cost is that re-importing the same CSV then fails every row with
// "applicantId already submitted by your university". This is the undo.
//
//   npm run reset:admissions
//
// Removes: applicants, their document rows AND the encrypted files on disk,
// import batches, admission audit rows, and any student accounts minted by
// enrolment. Leaves colleges, staff logins and everything else alone.
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import connectDB from "../config/db.js";
import { Applicant, DocumentSubmission, AdmissionBatch, AuditLog, User } from "../models/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_ROOT = path.resolve(__dirname, "../../secure-storage/admission-docs");

// Demo and test fixtures only, unless --all is passed. Deleting every applicant
// in a database that might hold real ones should never be the default.
const DEMO_IDS = /^(APP_2025_|APP_E2E_|E2E2_|APL_)/;

async function main() {
  const all = process.argv.includes("--all");
  const filter = all ? {} : { applicantId: DEMO_IDS };

  await connectDB();

  // Delete the ciphertext too — orphaned files in secure-storage would
  // otherwise accumulate forever with no row pointing at them.
  const docs = await DocumentSubmission.find(filter).select("filePath").lean();
  let filesRemoved = 0;
  for (const doc of docs) {
    if (!doc.filePath) continue;
    const absolute = path.resolve(SECURE_ROOT, doc.filePath);
    if (!absolute.startsWith(SECURE_ROOT + path.sep)) continue;
    try {
      fs.rmSync(absolute, { force: true });
      filesRemoved += 1;
    } catch {
      // A missing file is not a failure — we wanted it gone.
    }
  }

  const [applicants, documents, batches, students, audits] = await Promise.all([
    Applicant.deleteMany(filter),
    DocumentSubmission.deleteMany(filter),
    AdmissionBatch.deleteMany({}),
    User.deleteMany(all ? { role: "student", enrollmentNumber: { $ne: null } } : { userId: DEMO_IDS, role: "student" }),
    AuditLog.deleteMany({ action: /^(admission_|applicant_)/ }),
  ]);

  console.log(`\nAdmission pipeline reset${all ? " (ALL applicants)" : " (demo/test fixtures only)"}:`);
  console.log(`  applicants        ${applicants.deletedCount}`);
  console.log(`  documents         ${documents.deletedCount}  (${filesRemoved} encrypted file(s) removed)`);
  console.log(`  import batches    ${batches.deletedCount}`);
  console.log(`  student accounts  ${students.deletedCount}`);
  console.log(`  audit rows        ${audits.deletedCount}`);
  console.log("\nYou can now re-import demo-data/applicants.csv from Bulk Submission.\n");

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
