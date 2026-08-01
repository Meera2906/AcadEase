import { Certificate } from "../models/index.js";
import { verifyCertificateSignature } from "./certificate.js";
import { namesMatch } from "./admissionRules.js";
import { scanForQrCodes, extractPdfLinks } from "./qrScan.js";

// ---------------------------------------------------------------------------
// What a QR code can and cannot prove.
//
// A QR on a certificate is a pointer, not a proof. This module resolves that
// pointer as far as it honestly can:
//
//   * Points at a record WE hold (a certificate AcadEase issued) → we can
//     genuinely verify it: the record must exist, its HMAC must match, it must
//     not be revoked, and it must belong to this applicant. Failing any of
//     those is proof the document is bad, and the upload is refused outright.
//
//   * Points at a recognised issuer we cannot query (a state board, a
//     university) → we can confirm the QR is well-formed and where it leads,
//     and nothing more. It is surfaced to the reviewer as a one-click link.
//     We never render this as "verified", because we did not verify it.
//
//   * No QR at all → a flag, not a rejection. Plenty of genuine older
//     certificates predate QR codes entirely.
//
// Claiming more than this would be the same hallucination risk the whole
// design avoids, just wearing a security badge.
// ---------------------------------------------------------------------------

// Issuers whose verification portals are real and well-known. Presence here
// means "this is a plausible official verification link", never "verified".
const KNOWN_ISSUER_HOSTS = [
  "tn.gov.in",
  "dge.tn.gov.in",
  "dge1.tn.nic.in",
  "dge2.tn.nic.in",
  "tnresults.nic.in",
  "tndge.tn.gov.in",
  "tnteu.ac.in",
  "annauniv.edu",
  "b-u.ac.in",
  "unom.ac.in",
  "bharathiar.ac.in",
  "msuniv.ac.in",
  "cbse.gov.in",
  "results.cbse.nic.in",
  "cisce.org",
  "nad.gov.in",
  "digilocker.gov.in",
  "nios.ac.in",
  "ugc.gov.in",
];

export const QR_STATUS = {
  VERIFIED_SOURCE: "verified_source",
  REVOKED_SOURCE: "revoked_source",
  TAMPERED_SOURCE: "tampered_source",
  UNKNOWN_SOURCE_REFERENCE: "unknown_source_reference",
  HOLDER_MISMATCH: "holder_mismatch",
  ISSUER_REFERENCE: "issuer_reference",
  UNRECOGNISED_QR: "unrecognised_qr",
  ABSENT: "absent",
};

function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function matchesKnownIssuer(host) {
  if (!host) return null;
  return KNOWN_ISSUER_HOSTS.find((known) => host === known || host.endsWith(`.${known}`)) || null;
}

// Our own certificates encode "<base>/verify/<certId>".
function internalCertId(payload) {
  const match = String(payload).match(/\/verify\/([0-9a-fA-F-]{36})/);
  return match ? match[1] : null;
}

async function resolveInternal(certId, applicant) {
  const cert = await Certificate.findOne({ certId }).lean();

  if (!cert) {
    return {
      status: QR_STATUS.UNKNOWN_SOURCE_REFERENCE,
      fatal: true,
      headline: "This QR code points at an AcadEase certificate that does not exist",
      detail:
        "The QR references our own verification service, but no certificate with that ID was ever issued. A genuine certificate always resolves. This file has been rejected.",
    };
  }

  if (!verifyCertificateSignature(cert)) {
    return {
      status: QR_STATUS.TAMPERED_SOURCE,
      fatal: true,
      headline: "This certificate's contents do not match its signature",
      detail:
        "The certificate record exists, but its cryptographic signature does not match its contents — the document has been altered since it was issued. This file has been rejected.",
      certId,
    };
  }

  if (cert.status === "revoked") {
    return {
      status: QR_STATUS.REVOKED_SOURCE,
      fatal: true,
      headline: "This certificate has been revoked",
      detail: `Revoked${cert.revokedAt ? ` on ${new Date(cert.revokedAt).toDateString()}` : ""}${cert.revokedReason ? `: ${cert.revokedReason}` : ""}. A revoked certificate cannot support an admission.`,
      certId,
    };
  }

  if (applicant?.name && cert.studentName && !namesMatch(cert.studentName, applicant.name)) {
    return {
      status: QR_STATUS.HOLDER_MISMATCH,
      fatal: true,
      headline: "This certificate was issued to somebody else",
      detail: `The verified record is in the name of ${cert.studentName}, but you are applying as ${applicant.name}. This file has been rejected.`,
      certId,
    };
  }

  return {
    status: QR_STATUS.VERIFIED_SOURCE,
    fatal: false,
    headline: "Verified against the issuing record",
    detail: `The QR code resolves to a genuine, unrevoked certificate issued to ${cert.studentName} on ${new Date(cert.issuedAt).toDateString()}, and its signature checks out.`,
    certId,
    issuedTo: cert.studentName,
    issuedAt: cert.issuedAt,
  };
}

/**
 * @returns {Promise<{
 *   status: string, fatal: boolean, headline: string, detail: string,
 *   payloads: string[], flags: string[], issuerHost?: string, link?: string
 * }>}
 */
export async function checkDocumentAuthenticity({ buffer, mimeType, applicant }) {
  const { payloads } = await scanForQrCodes(buffer, mimeType);

  // Printed/linked verification URLs are a fallback channel when a QR bitmap
  // is too degraded to decode.
  const links = mimeType === "application/pdf" ? extractPdfLinks(buffer) : [];
  const candidates = [...new Set([...payloads, ...links])];

  // Anything referencing our own service is resolved first — it is the only
  // class of claim we can actually settle.
  for (const payload of candidates) {
    const certId = internalCertId(payload);
    if (!certId) continue;
    const resolved = await resolveInternal(certId, applicant);
    return {
      ...resolved,
      payloads,
      link: payload,
      flags: resolved.status === QR_STATUS.VERIFIED_SOURCE ? [] : ["qr_check_failed"],
    };
  }

  for (const payload of candidates) {
    const host = hostOf(payload);
    const issuer = matchesKnownIssuer(host);
    if (!issuer) continue;
    return {
      status: QR_STATUS.ISSUER_REFERENCE,
      fatal: false,
      headline: `Carries a verification link to ${issuer}`,
      detail:
        "This is a recognised issuer's verification portal, but we cannot query it automatically — a TNTEU reviewer opens the link and confirms the record against the document. Presence of this link is not by itself proof of authenticity.",
      payloads,
      issuerHost: issuer,
      link: payload,
      flags: ["qr_needs_manual_check"],
    };
  }

  if (payloads.length) {
    return {
      status: QR_STATUS.UNRECOGNISED_QR,
      fatal: false,
      headline: "Contains a QR code we do not recognise",
      detail:
        "A QR code was found and decoded, but it does not point at any verification service we know. The reviewer should check what it encodes.",
      payloads,
      flags: ["qr_unrecognised"],
    };
  }

  return {
    status: QR_STATUS.ABSENT,
    fatal: false,
    headline: "No QR code found",
    detail:
      "This document carries no scannable verification QR. That is normal for older certificates — it just means the reviewer verifies it the traditional way, against the printed register number and seal.",
    payloads: [],
    flags: ["qr_absent"],
  };
}

export const QR_FLAG_LABELS = {
  qr_check_failed: "QR verification failed",
  qr_needs_manual_check: "Issuer QR present — open the link and confirm manually",
  qr_unrecognised: "QR code present but not a recognised verification link",
  qr_absent: "No verification QR on this document",
};
