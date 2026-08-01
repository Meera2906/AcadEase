import crypto from "crypto";
import { loadPrivateKey, loadPublicKey, keyFingerprint, TNTEU_KEY_ID } from "./keyring.js";

// ---------------------------------------------------------------------------
// Counter-signature chains.
//
// A merit certificate is authorised by two different institutions in sequence:
// the university that taught the student, then TNTEU. Each one has to leave a
// mark that the other cannot produce, and that nobody can later forge, remove
// or reorder.
//
// Why RSA-PSS and not the HMAC the original certificate code used: an HMAC is
// symmetric. Whoever can *check* an HMAC can also *create* one, so every party
// able to verify a certificate could equally well mint a fake approval. With a
// signature, only the holder of a private key can sign, while anyone at all —
// including a stranger scanning the QR code — can verify. That is the property
// "non-spoofable" actually requires.
//
// The chain: every link signs over its own facts PLUS the signature of the link
// before it. Removing a stage, reordering two stages, or editing an earlier
// decision all break every signature downstream of the change.
//
//   link 0 (university)  signs  { …facts…, previous: "genesis" }
//   link 1 (TNTEU)       signs  { …facts…, previous: <link 0 signature> }
// ---------------------------------------------------------------------------

export const GENESIS = "genesis";
export const SIGNATURE_ALGORITHM = "rsa-pss-sha256";

const PSS_OPTIONS = {
  padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
  saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
};

// Field order is fixed and the payload is a plain delimited string, so the
// bytes signed today are byte-identical to the bytes verified in five years.
// (JSON.stringify would leave key order at the mercy of whatever produced the
// object, and a reordered payload verifies as tampered.)
export function canonicalPayload({
  subjectType,
  subjectId,
  stage,
  decision,
  actorId,
  actorRole,
  keyId,
  decidedAt,
  remarks = "",
  previousSignature = GENESIS,
}) {
  return [
    "acadease.approval.v1",
    subjectType,
    subjectId,
    stage,
    decision,
    actorId,
    actorRole,
    keyId,
    new Date(decidedAt).toISOString(),
    // Remarks are part of the signed record: a rejection reason cannot be
    // rewritten after the fact.
    crypto.createHash("sha256").update(String(remarks)).digest("hex"),
    crypto.createHash("sha256").update(String(previousSignature)).digest("hex"),
  ].join("|");
}

/**
 * Sign one link. `keyId` is the institution's own key — "tnteu" for the super
 * admin, the collegeId for a university — so the signature proves *which*
 * institution approved, not merely that somebody did.
 */
export function signApproval(fields) {
  const decidedAt = fields.decidedAt || new Date();
  const payload = canonicalPayload({ ...fields, decidedAt });

  const signature = crypto
    .sign("sha256", Buffer.from(payload, "utf8"), { key: loadPrivateKey(fields.keyId), ...PSS_OPTIONS })
    .toString("base64");

  return {
    // Stored on the link so the chain is self-describing: the final link binds
    // to the issued certificate while the earlier ones bind to the request, and
    // a verifier must not have to guess which. Both are inside the signed
    // payload, so a rewritten subject invalidates the signature.
    subjectType: fields.subjectType,
    subjectId: fields.subjectId,
    stage: fields.stage,
    decision: fields.decision,
    actorId: fields.actorId,
    actorName: fields.actorName || null,
    actorRole: fields.actorRole,
    keyId: fields.keyId,
    keyFingerprint: keyFingerprint(fields.keyId),
    remarks: fields.remarks || "",
    decidedAt,
    algorithm: SIGNATURE_ALGORITHM,
    previousSignature: fields.previousSignature || GENESIS,
    signature,
    payloadDigest: crypto.createHash("sha256").update(payload).digest("hex"),
  };
}

export function verifyApproval(approval, subjectType, subjectId) {
  if (!approval?.signature || !approval?.keyId) {
    return { valid: false, reason: "Approval carries no signature" };
  }

  const payload = canonicalPayload({
    subjectType,
    subjectId,
    stage: approval.stage,
    decision: approval.decision,
    actorId: approval.actorId,
    actorRole: approval.actorRole,
    keyId: approval.keyId,
    decidedAt: approval.decidedAt,
    remarks: approval.remarks || "",
    previousSignature: approval.previousSignature || GENESIS,
  });

  let valid = false;
  try {
    valid = crypto.verify(
      "sha256",
      Buffer.from(payload, "utf8"),
      { key: loadPublicKey(approval.keyId), ...PSS_OPTIONS },
      Buffer.from(approval.signature, "base64")
    );
  } catch {
    return { valid: false, reason: "Signature could not be checked against the issuing key" };
  }

  return valid ? { valid: true } : { valid: false, reason: "Signature does not match the recorded decision" };
}

/**
 * Verify the whole chain: every link individually, every link's stated
 * predecessor against the actual predecessor, and every link's subject against
 * the set the caller says is acceptable.
 *
 * `allowedSubjects` exists to stop a valid signature being lifted off one
 * record and pasted onto another — a link may only claim a subject the caller
 * expects to see in this chain.
 *
 * @returns {{ valid: boolean, links: Array, brokenAt: number|null }}
 */
export function verifyChain(approvals = [], subjectType, subjectId, allowedSubjects = []) {
  const links = [];
  let expectedPrevious = GENESIS;
  let brokenAt = null;

  const permitted = new Set([`${subjectType}:${subjectId}`, ...allowedSubjects.map(([t, i]) => `${t}:${i}`)]);

  approvals.forEach((approval, index) => {
    // Older links predate self-describing subjects; fall back to the caller's.
    const linkType = approval.subjectType || subjectType;
    const linkId = approval.subjectId || subjectId;
    const subjectAllowed = permitted.has(`${linkType}:${linkId}`);

    const linked = (approval.previousSignature || GENESIS) === expectedPrevious;
    const { valid, reason } = subjectAllowed
      ? verifyApproval(approval, linkType, linkId)
      : { valid: false, reason: "This approval was signed for a different record" };
    const ok = valid && linked;

    if (!ok && brokenAt === null) brokenAt = index;

    links.push({
      stage: approval.stage,
      decision: approval.decision,
      actorId: approval.actorId,
      actorName: approval.actorName,
      actorRole: approval.actorRole,
      authority: approval.keyId === TNTEU_KEY_ID ? "TNTEU" : approval.keyId,
      keyFingerprint: approval.keyFingerprint,
      decidedAt: approval.decidedAt,
      remarks: approval.remarks,
      algorithm: approval.algorithm,
      signaturePreview: `${String(approval.signature).slice(0, 24)}…`,
      valid: ok,
      reason: ok ? null : !linked ? "This approval does not follow the one before it" : reason,
    });

    expectedPrevious = approval.signature;
  });

  return { valid: brokenAt === null && links.length > 0, links, brokenAt };
}

export function lastSignature(approvals = []) {
  return approvals.length ? approvals[approvals.length - 1].signature : GENESIS;
}

// Which institutional key a given actor signs with.
export function keyIdForActor({ role, collegeId }) {
  if (role === "tnteu_admin") return TNTEU_KEY_ID;
  if (["college_admin", "college_coordinator"].includes(role)) return collegeId;
  return null;
}
