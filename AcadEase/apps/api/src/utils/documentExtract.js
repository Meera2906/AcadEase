import { extractPdfText } from "./pdfText.js";

// ---------------------------------------------------------------------------
// ASSISTIVE PRE-FILL ONLY.
//
// This module reads text out of an uploaded document and pattern-matches a few
// labelled fields so the reviewer sees a filled form instead of an empty one.
// It has no opinion on whether the document is genuine, and nothing it returns
// is trusted: every field is editable in the review UI and a human must confirm
// it before the document can move to `verified`. There is deliberately no model
// in this path — a wrong "looks valid" call here would cost a real student
// their admission.
// ---------------------------------------------------------------------------

export const EXPECTED_FIELDS = {
  "10th_marksheet": ["name", "registerNumber", "yearOfPassing"],
  "12th_marksheet": ["name", "registerNumber", "yearOfPassing"],
  ug_degree: ["name", "university", "yearOfPassing"],
  bed_degree: ["name", "university", "yearOfPassing"],
  transfer_certificate: ["name", "issueDate"],
  community_certificate: ["name", "community", "issueDate"],
  id_proof: ["name", "idNumber"],
};

export function expectedFieldsFor(documentType) {
  return EXPECTED_FIELDS[documentType] || ["name"];
}

const PATTERNS = {
  name: [/(?:candidate|student|applicant)?\s*name\s*[:\-]\s*(.+)/i],
  registerNumber: [/(?:register|registration|roll)\s*(?:no\.?|number)\s*[:\-]\s*([A-Z0-9/\-]+)/i],
  yearOfPassing: [/(?:year\s*of\s*passing|passing\s*year|month\s*(?:&|and)\s*year)\s*[:\-]\s*(?:\w+\s+)?(\d{4})/i],
  university: [/(?:university|board|institution)\s*[:\-]\s*(.+)/i],
  community: [/(?:community|caste)\s*[:\-]\s*(.+)/i],
  issueDate: [/(?:date\s*of\s*issue|issue\s*date|issued\s*on)\s*[:\-]\s*([0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4})/i],
  validUntil: [/(?:valid\s*(?:up\s*to|until|till))\s*[:\-]\s*([0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4})/i],
  dob: [/(?:date\s*of\s*birth|d\.?o\.?b\.?)\s*[:\-]\s*([0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4})/i],
  idNumber: [/(?:aadhaar|aadhar|id|passport|voter)\s*(?:no\.?|number|id)?\s*[:\-]\s*([A-Z0-9\s]{6,20})/i],
  percentage: [/(?:percentage|total|aggregate)\s*[:\-]\s*([0-9]{1,3}(?:\.[0-9]{1,2})?)\s*%?/i],
};

function matchField(text, key) {
  for (const pattern of PATTERNS[key] || []) {
    const found = text.match(pattern);
    if (found?.[1]) {
      const value = found[1].split(/\r?\n/)[0].trim().replace(/\s{2,}/g, " ");
      if (value) return value.slice(0, 120);
    }
  }
  return "";
}

/**
 * @returns {{ extractedFields: object, extractionSource: "pdf_text"|"unsupported"|"none" }}
 * Never throws — an unreadable file is a `unreadable` flag for the reviewer,
 * not a failed upload.
 */
export async function extractDocumentFields(buffer, mimeType, documentType) {
  const wanted = [...expectedFieldsFor(documentType), "dob", "issueDate", "validUntil"];
  const unique = [...new Set(wanted)];

  if (mimeType !== "application/pdf") {
    // Images would need an OCR engine; until one is wired in, the reviewer
    // reads the image directly and types what they see.
    return { extractedFields: {}, extractionSource: "unsupported" };
  }

  let text = "";
  try {
    text = extractPdfText(buffer);
  } catch {
    return { extractedFields: {}, extractionSource: "none" };
  }

  if (!text.trim()) {
    // Scanned PDF with no embedded text layer.
    return { extractedFields: {}, extractionSource: "none" };
  }

  const extractedFields = {};
  unique.forEach((key) => {
    const value = matchField(text, key);
    if (value) extractedFields[key] = value;
  });

  return { extractedFields, extractionSource: "pdf_text" };
}
