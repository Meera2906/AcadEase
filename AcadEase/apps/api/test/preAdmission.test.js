import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { evaluateEligibility, isReservedCategory, qualifyingMinimumFor } from "../src/utils/eligibility.js";
import { inspectUpload, readImageSize } from "../src/utils/imageInspect.js";

// Throwaway keyring: never touch the real one, and never depend on a
// passphrase that only exists in someone's .env.
process.env.DOC_KEY_PASSPHRASE = "test-passphrase-for-document-keys";
process.env.DOC_KEY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "acadease-keys-"));
const { encryptDocument, decryptDocument, DecryptionDeniedError } = await import("../src/utils/documentCrypto.js");
process.on("exit", () => fs.rmSync(process.env.DOC_KEY_DIR, { recursive: true, force: true }));

const a4Png = (width = 1654, height = 2339) => {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return PNG.sync.write(png);
};

// ── eligibility ─────────────────────────────────────────────────────────────

test("B.Ed needs 50% in the UG degree for a general-category applicant", () => {
  const result = evaluateEligibility({ program: "BEd", category: "OC", tenthPercentage: 80, twelfthPercentage: 75, ugPercentage: 49 });
  assert.equal(result.eligible, false);
  assert.equal(result.minimumRequired, 50);
  assert.ok(result.blockers[0].includes("50%"));
});

test("reserved categories qualify at the relaxed 45% rate", () => {
  const marks = { program: "BEd", tenthPercentage: 80, twelfthPercentage: 75, ugPercentage: 47 };
  assert.equal(evaluateEligibility({ ...marks, category: "OC" }).eligible, false);
  assert.equal(evaluateEligibility({ ...marks, category: "SC" }).eligible, true);
  assert.equal(qualifyingMinimumFor("BEd", "MBC"), 45);
  assert.ok(isReservedCategory("bc"));
  assert.ok(!isReservedCategory("OC"));
});

test("M.Ed is gated on the B.Ed percentage, not the UG percentage", () => {
  const base = { program: "MEd", category: "OC", tenthPercentage: 90, twelfthPercentage: 88, ugPercentage: 80 };
  assert.equal(evaluateEligibility({ ...base, bedPercentage: 44 }).eligible, false);
  assert.equal(evaluateEligibility({ ...base, bedPercentage: 55 }).eligible, true);
});

test("undeclared marks are reported as missing, not as a failure", () => {
  const result = evaluateEligibility({ program: "BEd", category: "OC", tenthPercentage: 80 });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.missing, ["twelfthPercentage", "ugPercentage"]);
  assert.deepEqual(result.blockers, []);
});

test("a failed 10th blocks the application regardless of degree marks", () => {
  const result = evaluateEligibility({ program: "BEd", category: "OC", tenthPercentage: 30, twelfthPercentage: 75, ugPercentage: 85 });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.some((b) => b.includes("35%")));
});

test("eligibility is deterministic for identical input", () => {
  const input = { program: "BEd", category: "BC", tenthPercentage: 71.5, twelfthPercentage: 68, ugPercentage: 46 };
  assert.deepEqual(evaluateEligibility(input), evaluateEligibility(input));
});

// ── legibility ──────────────────────────────────────────────────────────────

test("a full-size A4 scan is accepted", () => {
  const result = inspectUpload(a4Png(), "image/png");
  assert.equal(result.ok, true, JSON.stringify(result.hardFailures));
  assert.ok(result.metrics.estimatedDpi >= 200);
});

test("a phone-cropped thumbnail is refused with a reason", () => {
  const result = inspectUpload(a4Png(400, 500), "image/png");
  assert.equal(result.ok, false);
  assert.ok(result.hardFailures[0].includes("900x1100"));
});

test("a low-DPI full-page scan is refused", () => {
  const result = inspectUpload(a4Png(1000, 1200), "image/png");
  assert.equal(result.ok, false);
  assert.ok(result.hardFailures.some((f) => f.includes("DPI")));
});

test("a small born-digital PDF is accepted — file size is not a legibility test", () => {
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(2000, 0x20)]);
  assert.equal(inspectUpload(pdf, "application/pdf").ok, true);
});

test("a file merely named .pdf is refused", () => {
  assert.equal(inspectUpload(Buffer.alloc(80000, 7), "application/pdf").ok, false);
});

test("an oversized file is refused", () => {
  const huge = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024)]);
  assert.equal(inspectUpload(huge, "application/pdf").ok, false);
});

test("PNG dimensions are read from the IHDR header", () => {
  assert.deepEqual(readImageSize(a4Png(120, 340), "image/png"), { width: 120, height: 340 });
});

// ── envelope encryption ─────────────────────────────────────────────────────

const PLAINTEXT = Buffer.from("Aadhaar 4821 7734 9910 — Anjali Murugan");

test("what is written to disk is not the plaintext", () => {
  const { ciphertext } = encryptDocument(PLAINTEXT, { collegeId: "COL_A" });
  assert.ok(!ciphertext.includes("Aadhaar"));
  assert.ok(!ciphertext.equals(PLAINTEXT));
});

test("TNTEU and the owning university can both decrypt", () => {
  const { ciphertext, encryption } = encryptDocument(PLAINTEXT, { collegeId: "COL_A" });
  assert.ok(decryptDocument(ciphertext, encryption, { role: "tnteu_admin" }).equals(PLAINTEXT));
  assert.ok(decryptDocument(ciphertext, encryption, { role: "college_admin", collegeId: "COL_A" }).equals(PLAINTEXT));
});

test("no other principal holds a key path to the contents", () => {
  const { ciphertext, encryption } = encryptDocument(PLAINTEXT, { collegeId: "COL_A" });
  for (const actor of [
    { role: "college_admin", collegeId: "COL_B" },
    { role: "faculty", collegeId: "COL_A" },
    { role: "student", collegeId: "COL_A" },
    { role: "applicant", collegeId: "COL_A" },
    { role: undefined, collegeId: "COL_A" },
  ]) {
    assert.throws(
      () => decryptDocument(ciphertext, encryption, actor),
      DecryptionDeniedError,
      `${actor.role} / ${actor.collegeId} should not be able to decrypt`
    );
  }
});

test("exactly two keys are wrapped — TNTEU and the owner", () => {
  const { encryption } = encryptDocument(PLAINTEXT, { collegeId: "COL_A" });
  assert.deepEqual(Object.keys(encryption.wrappedKeys).sort(), ["COL_A", "tnteu"]);
});

test("tampered ciphertext is rejected rather than partially decrypted", () => {
  const { ciphertext, encryption } = encryptDocument(PLAINTEXT, { collegeId: "COL_A" });
  const tampered = Buffer.from(ciphertext);
  tampered[3] ^= 0xff;
  assert.throws(() => decryptDocument(tampered, encryption, { role: "tnteu_admin" }));
});

test("each document gets its own data key", () => {
  const first = encryptDocument(PLAINTEXT, { collegeId: "COL_A" });
  const second = encryptDocument(PLAINTEXT, { collegeId: "COL_A" });
  assert.notEqual(first.encryption.wrappedKeys.COL_A, second.encryption.wrappedKeys.COL_A);
  assert.ok(!first.ciphertext.equals(second.ciphertext));
});
