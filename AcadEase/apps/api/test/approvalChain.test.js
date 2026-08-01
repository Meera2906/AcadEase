import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DOC_KEY_PASSPHRASE = "test-passphrase-for-approval-chain";
process.env.DOC_KEY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "acadease-chain-"));
const { signApproval, verifyApproval, verifyChain, lastSignature, keyIdForActor, GENESIS } =
  await import("../src/utils/approvalChain.js");
process.on("exit", () => fs.rmSync(process.env.DOC_KEY_DIR, { recursive: true, force: true }));

const SUBJECT = ["certificate_request", "req_001"];

function collegeApproval(previous = GENESIS, overrides = {}) {
  return signApproval({
    subjectType: SUBJECT[0],
    subjectId: SUBJECT[1],
    stage: "college_review",
    decision: "approved",
    actorId: "ADM_CSE_001",
    actorName: "Mrs. Kavitha Selvam",
    actorRole: "college_admin",
    keyId: "TNTEU_COL_0417",
    remarks: "Marks verified against our records.",
    previousSignature: previous,
    ...overrides,
  });
}

function tnteuApproval(previous, overrides = {}) {
  return signApproval({
    subjectType: SUBJECT[0],
    subjectId: SUBJECT[1],
    stage: "tnteu_review",
    decision: "approved",
    actorId: "SUP_001",
    actorName: "Dr. R. Venkataraman",
    actorRole: "tnteu_admin",
    keyId: "tnteu",
    remarks: "Counter-signed.",
    previousSignature: previous,
    ...overrides,
  });
}

test("a two-stage chain verifies end to end", () => {
  const first = collegeApproval();
  const second = tnteuApproval(first.signature);
  const result = verifyChain([first, second], ...SUBJECT);

  assert.equal(result.valid, true, JSON.stringify(result.links.map((l) => l.reason)));
  assert.equal(result.links.length, 2);
  assert.equal(result.links[0].authority, "TNTEU_COL_0417");
  assert.equal(result.links[1].authority, "TNTEU");
});

test("each signature identifies which institution produced it", () => {
  const first = collegeApproval();
  const second = tnteuApproval(first.signature);
  assert.notEqual(first.keyFingerprint, second.keyFingerprint);
  assert.equal(first.keyId, "TNTEU_COL_0417");
  assert.equal(second.keyId, "tnteu");
});

test("a college cannot forge TNTEU's counter-signature", () => {
  const first = collegeApproval();
  // The college signs with its own key but claims to be the TNTEU stage.
  const forged = collegeApproval(first.signature, {
    stage: "tnteu_review",
    actorId: "SUP_001",
    actorRole: "tnteu_admin",
  });
  // Relabelling it as TNTEU's key is what a real forgery attempt looks like.
  forged.keyId = "tnteu";

  assert.equal(verifyApproval(forged, ...SUBJECT).valid, false);
  assert.equal(verifyChain([first, forged], ...SUBJECT).valid, false);
});

test("editing a recorded decision breaks its signature", () => {
  const approval = collegeApproval();
  approval.decision = "rejected";
  assert.equal(verifyApproval(approval, ...SUBJECT).valid, false);
});

test("rewriting a rejection reason after the fact breaks its signature", () => {
  const approval = collegeApproval(GENESIS, { decision: "rejected", remarks: "Marks do not meet the threshold." });
  assert.equal(verifyApproval(approval, ...SUBJECT).valid, true);
  approval.remarks = "Approved by mistake.";
  assert.equal(verifyApproval(approval, ...SUBJECT).valid, false);
});

test("back-dating an approval breaks its signature", () => {
  const approval = collegeApproval();
  approval.decidedAt = new Date("2020-01-01");
  assert.equal(verifyApproval(approval, ...SUBJECT).valid, false);
});

test("removing the university's approval invalidates TNTEU's", () => {
  const first = collegeApproval();
  const second = tnteuApproval(first.signature);
  const result = verifyChain([second], ...SUBJECT);
  assert.equal(result.valid, false);
  assert.equal(result.links[0].reason, "This approval does not follow the one before it");
});

test("reordering the stages invalidates the chain", () => {
  const first = collegeApproval();
  const second = tnteuApproval(first.signature);
  assert.equal(verifyChain([second, first], ...SUBJECT).valid, false);
});

test("splicing an extra approval into the middle is detected", () => {
  const first = collegeApproval();
  const second = tnteuApproval(first.signature);
  const spliced = collegeApproval(first.signature, { remarks: "Sneaked in." });
  const result = verifyChain([first, spliced, second], ...SUBJECT);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAt, 2);
});

test("a signature cannot be replayed onto a different request", () => {
  const approval = collegeApproval();
  assert.equal(verifyApproval(approval, "certificate_request", "req_999").valid, false);
});

test("a certificate chain and a university-request chain do not interchange", () => {
  const approval = collegeApproval();
  assert.equal(verifyApproval(approval, "university_request", SUBJECT[1]).valid, false);
});

test("verification needs only the public key — anyone can check, nobody can mint", () => {
  const approval = signApproval({
    subjectType: SUBJECT[0], subjectId: SUBJECT[1], stage: "college_review", decision: "approved",
    actorId: "A", actorRole: "college_admin", keyId: "KEYLESS_COLLEGE", previousSignature: GENESIS,
  });

  // Take away the private key entirely: a verifier still verifies.
  fs.rmSync(path.join(process.env.DOC_KEY_DIR, "KEYLESS_COLLEGE.key.pem"));
  assert.equal(verifyApproval(approval, ...SUBJECT).valid, true);

  // But signing is now impossible, and — critically — the system refuses to
  // quietly mint a replacement key, which would invalidate this signature.
  assert.throws(
    () => signApproval({
      subjectType: SUBJECT[0], subjectId: SUBJECT[1], stage: "college_review", decision: "approved",
      actorId: "A", actorRole: "college_admin", keyId: "KEYLESS_COLLEGE", previousSignature: GENESIS,
    }),
    /incomplete/
  );
  assert.equal(verifyApproval(approval, ...SUBJECT).valid, true);
});

test("lastSignature threads the chain and returns genesis when empty", () => {
  assert.equal(lastSignature([]), GENESIS);
  const first = collegeApproval();
  assert.equal(lastSignature([first]), first.signature);
});

test("only institutional roles hold a signing key", () => {
  assert.equal(keyIdForActor({ role: "tnteu_admin" }), "tnteu");
  assert.equal(keyIdForActor({ role: "college_admin", collegeId: "C1" }), "C1");
  assert.equal(keyIdForActor({ role: "student", collegeId: "C1" }), null);
  assert.equal(keyIdForActor({ role: "faculty", collegeId: "C1" }), null);
});
