import crypto from "crypto";

/**
 * Generate SHA-256 hex hash for the provided base64 string.
 * Expects the full Base64 representation of the PDF as input.
 */
export function generateCertificateHash(base64Data) {
  if (typeof base64Data !== "string") {
    throw new TypeError("base64Data must be a string");
  }
  // Compute SHA-256 over the base64 string
  const hash = crypto.createHash("sha256").update(base64Data, "utf8").digest("hex");
  return hash;
}

export default generateCertificateHash;
