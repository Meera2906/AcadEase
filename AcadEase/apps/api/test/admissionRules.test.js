import test from "node:test";
import assert from "node:assert/strict";
import {
  computeFlags,
  deriveApplicantStatus,
  namesMatch,
  requiredDocumentsFor,
  sha256,
} from "../src/utils/admissionRules.js";
import { parseCsvRecords } from "../src/utils/csv.js";

const applicant = { applicantId: "APP_001", name: "Anjali Murugan", collegeId: "COL_1" };

test("identical files submitted for two applicants raise duplicate_hash", () => {
  const { flags, flagDetails } = computeFlags({
    applicant,
    extractedFields: { name: "Anjali Murugan", registerNumber: "1024578901", yearOfPassing: "2018" },
    extractionSource: "pdf_text",
    expectedFields: ["name", "registerNumber", "yearOfPassing"],
    hashMatches: [{ applicantId: "APP_009", collegeId: "COL_2", documentType: "10th_marksheet" }],
  });

  assert.ok(flags.includes("duplicate_hash"));
  assert.equal(flagDetails.duplicate_hash.applicantId, "APP_009");
});

test("a clean document raises no flags", () => {
  const { flags } = computeFlags({
    applicant,
    extractedFields: { name: "Anjali Murugan", registerNumber: "1024578901", yearOfPassing: "2018" },
    extractionSource: "pdf_text",
    expectedFields: ["name", "registerNumber", "yearOfPassing"],
    hashMatches: [],
  });

  assert.deepEqual(flags, []);
});

test("a missing expected field and a foreign name both flag", () => {
  const { flags, flagDetails } = computeFlags({
    applicant,
    extractedFields: { name: "Prakash Ramalingam" },
    extractionSource: "pdf_text",
    expectedFields: ["name", "issueDate"],
    hashMatches: [],
  });

  assert.ok(flags.includes("missing_field"));
  assert.deepEqual(flagDetails.missing_field.fields, ["issueDate"]);
  assert.ok(flags.includes("name_mismatch"));
});

test("a scan with no text layer flags as unreadable rather than missing_field", () => {
  const { flags } = computeFlags({
    applicant,
    extractedFields: {},
    extractionSource: "unsupported",
    expectedFields: ["name", "idNumber"],
    hashMatches: [],
  });

  assert.deepEqual(flags, ["unreadable"]);
});

test("lapsed validity flags expired_document", () => {
  const { flags } = computeFlags({
    applicant,
    extractedFields: { name: "Anjali Murugan", community: "BC", issueDate: "10-02-2019", validUntil: "09-02-2022" },
    extractionSource: "pdf_text",
    expectedFields: ["name", "community", "issueDate"],
    hashMatches: [],
    now: new Date("2026-08-01"),
  });

  assert.ok(flags.includes("expired_document"));
});

test("initials and reordered name parts do not count as a mismatch", () => {
  assert.ok(namesMatch("A. Murugan Anjali", "Anjali Murugan"));
  assert.ok(namesMatch("Thiru. Bharath Selvan", "Bharath Selvan"));
  assert.ok(!namesMatch("Prakash Ramalingam", "Anjali Murugan"));
});

test("verifying one document does not verify the applicant", () => {
  const required = requiredDocumentsFor("BEd");
  const documents = required.map((documentType, index) => ({
    documentType,
    status: index === 0 ? "verified" : "pending",
    flags: [],
  }));

  const derived = deriveApplicantStatus("BEd", documents);
  assert.equal(derived.status, "under_review");
  assert.equal(derived.verifiedCount, 1);
  assert.equal(derived.requiredCount, required.length);
});

test("an applicant flips to verified only when every required document is verified", () => {
  const required = requiredDocumentsFor("BEd");
  const documents = required.map((documentType) => ({ documentType, status: "verified", flags: [] }));

  assert.equal(deriveApplicantStatus("BEd", documents).status, "verified");
});

test("optional extras cannot substitute for a missing required document", () => {
  const required = requiredDocumentsFor("BEd");
  const documents = required
    .slice(0, required.length - 1)
    .map((documentType) => ({ documentType, status: "verified", flags: [] }));
  documents.push({ documentType: "community_certificate", status: "verified", flags: [] });

  const derived = deriveApplicantStatus("BEd", documents);
  assert.equal(derived.status, "under_review");
  assert.equal(derived.verifiedCount, required.length - 1);
});

test("one rejected document rejects the applicant", () => {
  const required = requiredDocumentsFor("MEd");
  const documents = required.map((documentType, index) => ({
    documentType,
    status: index === 2 ? "rejected" : "verified",
    flags: [],
  }));

  assert.equal(deriveApplicantStatus("MEd", documents).status, "rejected");
});

test("CSV parsing keeps commas inside quoted fields", () => {
  const { records } = parseCsvRecords('applicantId,name,program\nAPP_1,"Harini, Balan",BEd\n');
  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Harini, Balan");
  assert.equal(records[0].__row, 2);
});

test("the same bytes always hash to the same digest", () => {
  assert.equal(sha256(Buffer.from("marksheet")), sha256(Buffer.from("marksheet")));
  assert.notEqual(sha256(Buffer.from("marksheet")), sha256(Buffer.from("marksheet ")));
});

// Re-uploading a document into the slot it already occupies is a replacement,
// not a duplicate. Before this was fixed, every file in a re-imported batch
// flagged itself against its own previous version — which meant a second demo
// run showed 35/35 flagged and nothing could be bulk-approved.
test("replacing a document with the same file does not raise duplicate_resubmit", () => {
  const { flags } = computeFlags({
    applicant,
    documentType: "10th_marksheet",
    extractedFields: { name: "Anjali Murugan", registerNumber: "1024578901", yearOfPassing: "2018" },
    extractionSource: "pdf_text",
    expectedFields: ["name", "registerNumber", "yearOfPassing"],
    // The row already sitting in this slot: same applicant, same type.
    hashMatches: [{ applicantId: "APP_001", collegeId: "COL_1", documentType: "10th_marksheet" }],
  });

  assert.ok(!flags.includes("duplicate_resubmit"), `unexpected flags: ${flags.join(", ")}`);
});

test("the same file filed under a second document type still raises duplicate_resubmit", () => {
  const { flags, flagDetails } = computeFlags({
    applicant,
    documentType: "transfer_certificate",
    extractedFields: { name: "Anjali Murugan" },
    extractionSource: "pdf_text",
    expectedFields: ["name"],
    // Already submitted as the 10th marksheet; now being reused as the TC.
    hashMatches: [{ applicantId: "APP_001", collegeId: "COL_1", documentType: "10th_marksheet" }],
  });

  assert.ok(flags.includes("duplicate_resubmit"), `expected duplicate_resubmit, got: ${flags.join(", ")}`);
  assert.equal(flagDetails.duplicate_resubmit.documentType, "10th_marksheet");
});

test("another applicant's copy still raises duplicate_hash even in the same slot", () => {
  const { flags } = computeFlags({
    applicant,
    documentType: "10th_marksheet",
    extractedFields: { name: "Anjali Murugan" },
    extractionSource: "pdf_text",
    expectedFields: ["name"],
    hashMatches: [
      { applicantId: "APP_001", collegeId: "COL_1", documentType: "10th_marksheet" }, // itself
      { applicantId: "APP_009", collegeId: "COL_1", documentType: "10th_marksheet" }, // someone else
    ],
  });

  assert.ok(flags.includes("duplicate_hash"), `expected duplicate_hash, got: ${flags.join(", ")}`);
  assert.ok(!flags.includes("duplicate_resubmit"), `unexpected duplicate_resubmit: ${flags.join(", ")}`);
});
