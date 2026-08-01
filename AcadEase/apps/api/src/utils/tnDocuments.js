// ---------------------------------------------------------------------------
// Knowing WHAT a document is, and what to do when a QR cannot help.
//
// Tamil Nadu SSLC and HSC marksheets — by far the most common documents in an
// admission file — carry no QR code at all. So for those, the QR check is
// silent by construction, and saying "no QR, that's normal" is worse than
// useless: it reassures the reviewer at exactly the moment they should be
// checking something. Two deterministic things fill that gap.
//
//   1. IDENTITY. A document claiming to be a 10th marksheet should read like
//      one. TN board documents carry very stable printed text, so we can tell
//      a marksheet from a degree certificate by keyword, with no model
//      involved. This catches the common real failure — the wrong file
//      attached to the wrong slot — which the QR check never could.
//
//   2. GUIDANCE. Where there is no QR, there is still an issuer and a portal.
//      Rather than a dead end, the reviewer gets the register number already
//      extracted, a link to the issuing authority's own results page, and the
//      specific list of fields to compare. That is the labour reduction for
//      this document type: not skipping the manual check, but removing every
//      step of it except the comparison itself.
//
// Nothing here decides authenticity. Identity mismatch is a fact about the
// text; the verification guidance is instructions for a human.
// ---------------------------------------------------------------------------

// Weighted keyword signatures. Weight 3 = decisive for this type, 1 = supporting.
const SIGNATURES = {
  "10th_marksheet": [
    [/secondary\s+school\s+leaving\s+certificate/i, 3],
    [/\bs\.?s\.?l\.?c\.?\b/i, 3],
    [/\btenth\s+standard\b/i, 3],
    [/\bclass\s*x\b/i, 3],
    [/\b10th\s+(standard|marksheet|mark\s*sheet)\b/i, 3],
    [/directorate\s+of\s+government\s+examinations/i, 1],
    [/statement\s+of\s+marks/i, 1],
    [/register\s*(no|number)/i, 1],
  ],
  "12th_marksheet": [
    [/higher\s+secondary/i, 3],
    [/\bh\.?s\.?c\.?\b/i, 3],
    [/\btwelfth\s+standard\b/i, 3],
    [/\bclass\s*xii\b/i, 3],
    [/\b12th\s+(standard|marksheet|mark\s*sheet)\b/i, 3],
    [/\bplus\s*two\b/i, 3],
    [/directorate\s+of\s+government\s+examinations/i, 1],
    [/statement\s+of\s+marks/i, 1],
  ],
  ug_degree: [
    [/bachelor\s+of\s+(science|arts|commerce|engineering|technology)/i, 3],
    [/bachelor\s+degree\s+certificate/i, 3],
    [/\bb\.?\s?(sc|a|com|e|tech)\b/i, 2],
    [/degree\s+of\s+bachelor/i, 3],
    [/convocation/i, 2],
    [/university/i, 1],
  ],
  bed_degree: [
    // Outranks ug_degree deliberately: a B.Ed certificate also says "Bachelor".
    [/bachelor\s+of\s+education/i, 4],
    [/\bb\.?\s?ed\b/i, 3],
    [/degree\s+of\s+bachelor\s+of\s+education/i, 4],
  ],
  transfer_certificate: [
    [/transfer\s+certificate/i, 4],
    [/\bt\.?\s?c\.?\s+(no|number)/i, 2],
    [/date\s+of\s+leaving/i, 2],
    [/conduct/i, 1],
  ],
  community_certificate: [
    [/community\s+certificate/i, 4],
    [/caste\s+certificate/i, 4],
    [/belongs?\s+to\s+.{0,30}community/i, 3],
    [/\btahsildar\b/i, 2],
    [/revenue\s+department/i, 1],
  ],
  id_proof: [
    [/\baadhaar\b|\baadhar\b/i, 4],
    [/unique\s+identification\s+authority/i, 4],
    [/republic\s+of\s+india.{0,40}passport/i, 4],
    [/election\s+commission\s+of\s+india/i, 4],
    [/driving\s+licence|driving\s+license/i, 4],
    [/permanent\s+account\s+number/i, 4],
    [/government\s+identity\s+proof/i, 3],
  ],
};

const DECISIVE_WEIGHT = 3;

/**
 * `score` is the weighted total; `decisive` records whether any marker unique
 * to this type matched. The distinction matters because several types share
 * boilerplate — "Statement of Marks" and "Directorate of Government
 * Examinations" appear on both SSLC and HSC sheets. Those supporting markers
 * must never be enough on their own to call a document a match.
 */
export function scoreDocumentTypes(text = "") {
  const result = {};
  for (const [type, markers] of Object.entries(SIGNATURES)) {
    let score = 0;
    let decisive = false;
    for (const [pattern, weight] of markers) {
      if (!pattern.test(text)) continue;
      score += weight;
      if (weight >= DECISIVE_WEIGHT) decisive = true;
    }
    result[type] = { score, decisive };
  }
  return result;
}

/**
 * Compare what the document says it is against what it was filed as.
 *
 * The severity ladder is deliberately cautious, because a false rejection
 * costs a real applicant their admission:
 *
 *   match       — the claimed type scores, and nothing else scores higher
 *   mismatch    — the claimed type scores nothing AND another type scores
 *                 decisively. Only then are we confident enough to refuse.
 *   unconfirmed — no readable text, or nothing recognisable. Flag for a human;
 *                 never refuse. Genuine scanned documents land here.
 */
export function checkClaimedType(claimedType, text = "", { extractionSource } = {}) {
  if (!text.trim() || extractionSource === "unsupported" || extractionSource === "none") {
    return {
      verdict: "unconfirmed",
      detectedType: null,
      detail:
        extractionSource === "unsupported"
          ? "This is an image, so its type could not be read automatically — confirm by eye that it is the right document."
          : "No machine-readable text, so the document type could not be confirmed automatically.",
    };
  }

  const scores = scoreDocumentTypes(text);
  const claimed = scores[claimedType] || { score: 0, decisive: false };
  const ranked = Object.entries(scores)
    .filter(([, s]) => s.score > 0)
    .sort((a, b) => b[1].score - a[1].score);

  const best = ranked[0];

  // A decisive marker for the claimed type, and nothing outranking it.
  if (claimed.decisive && (!best || claimed.score >= best[1].score)) {
    return { verdict: "match", detectedType: claimedType, scores, detail: "The document reads as the type it was filed under." };
  }

  // Decisive evidence of a *different* document, and nothing decisive for the
  // claimed one. This is the only case confident enough to refuse — it is the
  // "wrong file in the wrong slot" case, e.g. a 10th marksheet filed as a 12th.
  if (!claimed.decisive && best && best[1].decisive && best[0] !== claimedType) {
    return {
      verdict: "mismatch",
      detectedType: best[0],
      scores,
      detail: `This file reads as a ${DOCUMENT_LABELS_LOCAL[best[0]] || best[0]}, not a ${DOCUMENT_LABELS_LOCAL[claimedType] || claimedType}.`,
    };
  }

  // Both look plausible, or the claimed type is only supported by boilerplate.
  if (best && best[0] !== claimedType) {
    return {
      verdict: "unconfirmed",
      detectedType: best[0],
      scores,
      detail: `This reads more like a ${DOCUMENT_LABELS_LOCAL[best[0]] || best[0]}. Confirm it is filed under the right type.`,
    };
  }

  return {
    verdict: "unconfirmed",
    detectedType: claimed.score > 0 ? claimedType : null,
    scores,
    detail:
      claimed.score > 0
        ? "Only generic markings were recognised — confirm this is the right document."
        : "The document type could not be recognised from its text.",
  };
}

// Kept local so this module has no import cycle with admissionRules.
const DOCUMENT_LABELS_LOCAL = {
  "10th_marksheet": "10th Marksheet",
  "12th_marksheet": "12th Marksheet",
  ug_degree: "UG Degree Certificate",
  bed_degree: "B.Ed Degree Certificate",
  transfer_certificate: "Transfer Certificate",
  community_certificate: "Community Certificate",
  id_proof: "Government ID Proof",
};

// ---------------------------------------------------------------------------
// What to do when there is no QR — per document type, per issuer
// ---------------------------------------------------------------------------

const GUIDANCE = {
  "10th_marksheet": {
    issuer: "Directorate of Government Examinations, Tamil Nadu",
    portal: "https://dge.tn.gov.in",
    portalLabel: "dge.tn.gov.in",
    altPortal: "https://tnresults.nic.in",
    lookupBy: ["registerNumber", "yearOfPassing"],
    note: "TN SSLC marksheets have never carried a QR code. The register number is the verification handle.",
    steps: [
      "Open the DGE results portal and enter the register number and year of passing.",
      "Compare the candidate name and date of birth shown there against this document.",
      "Compare the subject-wise marks and total.",
      "Check the printed DGE seal and the school code on the physical/scanned copy.",
    ],
  },
  "12th_marksheet": {
    issuer: "Directorate of Government Examinations, Tamil Nadu",
    portal: "https://dge.tn.gov.in",
    portalLabel: "dge.tn.gov.in",
    altPortal: "https://tnresults.nic.in",
    lookupBy: ["registerNumber", "yearOfPassing"],
    note: "TN HSC marksheets have never carried a QR code. The register number is the verification handle.",
    steps: [
      "Open the DGE results portal and enter the register number and year of passing.",
      "Compare the candidate name and date of birth shown there against this document.",
      "Compare the subject-wise marks and total — this is what the eligibility percentage rests on.",
      "Check the printed DGE seal and the school code on the physical/scanned copy.",
    ],
  },
  ug_degree: {
    issuer: "The awarding university",
    portal: "https://www.nad.gov.in",
    portalLabel: "National Academic Depository",
    lookupBy: ["registerNumber", "university", "yearOfPassing"],
    note: "Degree certificates are verified against the awarding university's convocation records, or via NAD/DigiLocker where the university has published them.",
    steps: [
      "Check the awarding university and year of passing against the applicant's declared record.",
      "Look the degree up on NAD/DigiLocker if that university publishes there.",
      "Otherwise raise a verification request with the university's controller of examinations.",
      "Confirm the degree is one recognised for this programme.",
    ],
  },
  bed_degree: {
    issuer: "The awarding university (commonly TNTEU itself)",
    portal: "https://www.tnteu.ac.in",
    portalLabel: "tnteu.ac.in",
    lookupBy: ["registerNumber", "yearOfPassing"],
    note: "If this B.Ed was awarded by TNTEU, it can be checked directly against TNTEU's own records.",
    steps: [
      "If TNTEU awarded it, look the register number up in TNTEU's own convocation records.",
      "Otherwise verify with the awarding university.",
      "Confirm the B.Ed percentage — M.Ed eligibility depends on it.",
    ],
  },
  transfer_certificate: {
    issuer: "The issuing school or college",
    portal: null,
    lookupBy: ["registerNumber", "issueDate"],
    note: "Transfer certificates are issued by the institution and have no central portal. Verification is by direct confirmation.",
    steps: [
      "Check the TC number, date of issue and the institution's seal.",
      "Confirm the date of leaving is consistent with the qualifying examination year.",
      "Where in doubt, confirm directly with the issuing institution.",
    ],
  },
  community_certificate: {
    issuer: "Revenue Department, Government of Tamil Nadu (e-Sevai)",
    portal: "https://tnedistrict.tn.gov.in",
    portalLabel: "tnedistrict.tn.gov.in",
    lookupBy: ["certificateNumber"],
    note: "e-Sevai community certificates issued since 2015 DO carry a QR and a certificate number that can be checked online. Older manually issued ones do not.",
    steps: [
      "Enter the certificate number on the TN e-Sevai verification page.",
      "Compare the name, community and issuing Tahsildar office.",
      "For pre-2015 manual certificates, confirm with the issuing taluk office.",
    ],
  },
  id_proof: {
    issuer: "UIDAI / the issuing authority",
    portal: "https://myaadhaar.uidai.gov.in/verify-aadhaar",
    portalLabel: "UIDAI",
    lookupBy: ["idNumber"],
    note: "Only check that the ID exists and the name and date of birth match. Do not record the full number beyond what is already on file.",
    steps: [
      "Confirm the name and date of birth match the applicant record.",
      "For Aadhaar, the UIDAI page confirms whether a number is valid without revealing holder details.",
      "Check the photograph is legible.",
    ],
  },
};

/**
 * Everything a reviewer needs to verify this document by hand, with the fields
 * we already extracted filled in so they do not have to re-read the scan.
 */
export function verificationGuidanceFor(documentType, extractedFields = {}) {
  const guidance = GUIDANCE[documentType];
  if (!guidance) return null;

  const lookupValues = {};
  (guidance.lookupBy || []).forEach((field) => {
    if (extractedFields[field]) lookupValues[field] = extractedFields[field];
  });

  return {
    documentType,
    issuer: guidance.issuer,
    portal: guidance.portal,
    portalLabel: guidance.portalLabel || guidance.portal,
    altPortal: guidance.altPortal || null,
    note: guidance.note,
    steps: guidance.steps,
    lookupBy: guidance.lookupBy || [],
    lookupValues,
    // True when we have the handle the portal actually asks for.
    lookupReady: (guidance.lookupBy || []).some((field) => Boolean(lookupValues[field])),
  };
}

// Document types that will never carry a QR, so their absence is not evidence
// of anything and must not be presented as reassurance.
export const QR_NEVER_EXPECTED = new Set([
  "10th_marksheet",
  "12th_marksheet",
  "transfer_certificate",
  "ug_degree",
  "bed_degree",
]);

export { DOCUMENT_LABELS_LOCAL as TN_DOCUMENT_LABELS };
