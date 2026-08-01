import test from "node:test";
import assert from "node:assert/strict";
import { checkClaimedType, verificationGuidanceFor, QR_NEVER_EXPECTED } from "../src/utils/tnDocuments.js";

const PDF = { extractionSource: "pdf_text" };

const SSLC = `GOVERNMENT OF TAMIL NADU
DIRECTORATE OF GOVERNMENT EXAMINATIONS
SECONDARY SCHOOL LEAVING CERTIFICATE (SSLC) — STATEMENT OF MARKS
Candidate Name: Anjali Murugan
Register Number: 1024578901
Year of Passing: 2018`;

const HSC = `GOVERNMENT OF TAMIL NADU
DIRECTORATE OF GOVERNMENT EXAMINATIONS
HIGHER SECONDARY EXAMINATION (HSC) — STATEMENT OF MARKS
Candidate Name: Anjali Murugan
Register Number: 2024578901
Year of Passing: 2020`;

const UG = `BHARATHIAR UNIVERSITY
BACHELOR DEGREE CERTIFICATE
Degree: Bachelor of Science
Candidate Name: Anjali Murugan`;

const BED = `TAMIL NADU TEACHERS EDUCATION UNIVERSITY
B.Ed DEGREE CERTIFICATE
Degree: Bachelor of Education
Candidate Name: Anjali Murugan`;

const TC = `TRANSFER CERTIFICATE
Candidate Name: Anjali Murugan
Date of Issue: 12-06-2023
Conduct: Good`;

const AADHAAR = `UNIQUE IDENTIFICATION AUTHORITY OF INDIA
Aadhaar Number: 4821 7734 9910
Name: Anjali Murugan`;

// ── the documents we expect to accept ───────────────────────────────────────

test("each TN document type is recognised as itself", () => {
  const cases = [
    [SSLC, "10th_marksheet"], [HSC, "12th_marksheet"], [UG, "ug_degree"],
    [BED, "bed_degree"], [TC, "transfer_certificate"], [AADHAAR, "id_proof"],
  ];
  for (const [text, type] of cases) {
    assert.equal(checkClaimedType(type, text, PDF).verdict, "match", `${type} should match itself`);
  }
});

// ── the case the reviewer actually hits: wrong file, wrong slot ─────────────

test("a 10th marksheet filed as a 12th marksheet is refused", () => {
  const result = checkClaimedType("12th_marksheet", SSLC, PDF);
  assert.equal(result.verdict, "mismatch");
  assert.equal(result.detectedType, "10th_marksheet");
  assert.match(result.detail, /10th Marksheet/);
});

test("a 12th marksheet filed as a 10th marksheet is refused", () => {
  assert.equal(checkClaimedType("10th_marksheet", HSC, PDF).verdict, "mismatch");
});

test("shared boilerplate alone is never enough to claim a match", () => {
  // Both SSLC and HSC sheets carry these lines. On their own they must not
  // satisfy either type, or the wrong-slot check would pass everything.
  const boilerplateOnly = `GOVERNMENT OF TAMIL NADU
DIRECTORATE OF GOVERNMENT EXAMINATIONS
STATEMENT OF MARKS
Register Number: 1024578901`;
  assert.notEqual(checkClaimedType("10th_marksheet", boilerplateOnly, PDF).verdict, "match");
  assert.notEqual(checkClaimedType("12th_marksheet", boilerplateOnly, PDF).verdict, "match");
});

test("a degree certificate filed as a marksheet is refused", () => {
  assert.equal(checkClaimedType("10th_marksheet", UG, PDF).verdict, "mismatch");
});

test("an ID proof filed as a degree is refused", () => {
  assert.equal(checkClaimedType("ug_degree", AADHAAR, PDF).verdict, "mismatch");
});

test("a B.Ed degree filed as a UG degree is refused despite both saying Bachelor", () => {
  const result = checkClaimedType("ug_degree", BED, PDF);
  assert.equal(result.verdict, "mismatch");
  assert.equal(result.detectedType, "bed_degree");
});

// ── never refuse a genuine document we simply cannot read ──────────────────

test("an image is unconfirmed, never refused", () => {
  const result = checkClaimedType("10th_marksheet", "", { extractionSource: "unsupported" });
  assert.equal(result.verdict, "unconfirmed");
  assert.match(result.detail, /image/i);
});

test("a scanned PDF with no text layer is unconfirmed, never refused", () => {
  const result = checkClaimedType("10th_marksheet", "", { extractionSource: "none" });
  assert.equal(result.verdict, "unconfirmed");
});

test("unrecognisable text is unconfirmed, never refused", () => {
  const result = checkClaimedType("10th_marksheet", "some scanned words that mean nothing", PDF);
  assert.equal(result.verdict, "unconfirmed");
  assert.equal(result.detectedType, null);
});

test("an unusually worded but genuine marksheet still matches on one decisive marker", () => {
  assert.equal(checkClaimedType("10th_marksheet", "Class X Marks Statement, Board of Examinations", PDF).verdict, "match");
});

// ── the QR gap this exists to fill ─────────────────────────────────────────

test("TN board and degree documents are known never to carry a QR", () => {
  for (const type of ["10th_marksheet", "12th_marksheet", "ug_degree", "bed_degree", "transfer_certificate"]) {
    assert.ok(QR_NEVER_EXPECTED.has(type), `${type} should be marked as never carrying a QR`);
  }
  // e-Sevai community certificates genuinely do carry one.
  assert.ok(!QR_NEVER_EXPECTED.has("community_certificate"));
});

test("guidance points a 10th marksheet at DGE with the register number filled in", () => {
  const guidance = verificationGuidanceFor("10th_marksheet", { registerNumber: "1024578901", yearOfPassing: "2018" });
  assert.match(guidance.issuer, /Directorate of Government Examinations/);
  assert.equal(guidance.portal, "https://dge.tn.gov.in");
  assert.equal(guidance.lookupValues.registerNumber, "1024578901");
  assert.equal(guidance.lookupReady, true);
  assert.ok(guidance.steps.length >= 3);
});

test("guidance reports not-ready when the lookup handle could not be read", () => {
  const guidance = verificationGuidanceFor("10th_marksheet", {});
  assert.equal(guidance.lookupReady, false);
  assert.deepEqual(guidance.lookupValues, {});
});

test("every document type has verification guidance", () => {
  for (const type of [
    "10th_marksheet", "12th_marksheet", "ug_degree", "bed_degree",
    "transfer_certificate", "community_certificate", "id_proof",
  ]) {
    const guidance = verificationGuidanceFor(type, {});
    assert.ok(guidance, `${type} has no guidance`);
    assert.ok(guidance.steps.length > 0, `${type} has no steps`);
    assert.ok(guidance.issuer, `${type} names no issuer`);
  }
});
