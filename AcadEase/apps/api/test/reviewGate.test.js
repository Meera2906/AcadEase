import test from "node:test";
import assert from "node:assert/strict";
import {
  assessDocument,
  severityCountPipeline,
  stageForRole,
  nextStageAfter,
  SUSPECT_FLAGS,
  ATTENTION_FLAGS,
} from "../src/utils/reviewGate.js";
import { FLAG_LABELS } from "../src/utils/admissionRules.js";
import { QR_STATUS, QR_FLAG_LABELS } from "../src/utils/qrAuthenticity.js";

test("a document with no findings is the only thing that can be bulk-approved", () => {
  const assessment = assessDocument({ flags: [], qrCheck: { status: QR_STATUS.ABSENT }, typeCheck: { verdict: "match" } });
  assert.equal(assessment.severity, "clean");
  assert.equal(assessment.bulkEligible, true);
  assert.deepEqual(assessment.blockers, []);
});

test("a duplicated file is suspect and can never be swept through", () => {
  const assessment = assessDocument({ flags: ["duplicate_hash"] });
  assert.equal(assessment.severity, "suspect");
  assert.equal(assessment.bulkEligible, false);
  assert.equal(assessment.blockers[0].code, "duplicate_hash");
});

test("a name mismatch is suspect, not merely something to look at", () => {
  assert.equal(assessDocument({ flags: ["name_mismatch"] }).severity, "suspect");
});

test("a check that could not conclude blocks bulk approval without calling the document fake", () => {
  const assessment = assessDocument({ flags: ["unreadable"] });
  assert.equal(assessment.severity, "attention");
  assert.equal(assessment.bulkEligible, false);
});

test("a suspect finding outranks an attention finding on the same document", () => {
  assert.equal(assessDocument({ flags: ["unreadable", "duplicate_hash"] }).severity, "suspect");
});

test("a QR that failed to resolve blocks bulk approval even with no flag recorded", () => {
  const assessment = assessDocument({ flags: [], qrCheck: { status: QR_STATUS.REVOKED_SOURCE, headline: "Revoked" } });
  assert.equal(assessment.severity, "suspect");
  assert.equal(assessment.bulkEligible, false);
});

test("a file that reads as a different document type blocks bulk approval", () => {
  const assessment = assessDocument({ flags: [], typeCheck: { verdict: "mismatch", detail: "reads as a UG degree" } });
  assert.equal(assessment.severity, "suspect");
  assert.match(assessment.blockers[0].label, /UG degree/);
});

test("an issuer QR on an otherwise clean document is not a blocker", () => {
  // Nearly every modern certificate carries one. Treating it as a finding
  // would make the clean bucket permanently empty.
  const assessment = assessDocument({
    flags: [],
    qrCheck: { status: QR_STATUS.ISSUER_REFERENCE },
    typeCheck: { verdict: "match" },
  });
  assert.equal(assessment.bulkEligible, true);
});

test("a flag nobody has classified still blocks bulk approval", () => {
  // A check added later must not silently become non-blocking.
  const assessment = assessDocument({ flags: ["some_future_check"] });
  assert.equal(assessment.bulkEligible, false);
  assert.equal(assessment.severity, "attention");
});

test("every flag the rules can raise is classified by the gate", () => {
  const known = new Set([...SUSPECT_FLAGS, ...ATTENTION_FLAGS]);
  Object.keys({ ...FLAG_LABELS, ...QR_FLAG_LABELS }).forEach((flag) => {
    assert.ok(known.has(flag), `${flag} is not classified as suspect or attention`);
  });
});

test("the database-side severity counter matches the in-memory classifier", () => {
  // The queue counts the backlog with an aggregation and classifies each row on
  // screen in JavaScript. If those two ever disagree, the reviewer is told a
  // different number of documents are sweepable than the gate will actually
  // sweep. This pins the aggregation's branch conditions to the same inputs.
  const [{ $project: projection }] = severityCountPipeline();
  const branches = projection.severity.$switch.branches;

  const suspectCase = JSON.stringify(branches[0].case);
  [...SUSPECT_FLAGS].forEach((flag) => {
    assert.ok(suspectCase.includes(flag), `${flag} is missing from the suspect branch`);
  });
  assert.ok(suspectCase.includes("mismatch"), "the wrong-document-type rule is missing");
  assert.equal(branches[1].then, "attention");
  assert.equal(projection.severity.$switch.default, "clean");

  // Nothing an attention flag can do should land in the suspect branch.
  [...ATTENTION_FLAGS].forEach((flag) => {
    assert.equal(assessDocument({ flags: [flag] }).severity, "attention");
  });
});

test("a role only ever holds one stage of the chain", () => {
  assert.equal(stageForRole("college_admin"), "college");
  assert.equal(stageForRole("college_coordinator"), "college");
  assert.equal(stageForRole("tnteu_admin"), "tnteu");
  assert.equal(stageForRole("student"), null);
  assert.equal(stageForRole("faculty"), null);
});

test("the chain runs university then TNTEU then done", () => {
  assert.equal(nextStageAfter("college"), "tnteu");
  assert.equal(nextStageAfter("tnteu"), "complete");
});
