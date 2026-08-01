import fs from "fs";
import path from "path";
import { fileToBase64, bufferToBase64 } from "./base64Converter.js";
import { generateCertificateHash } from "./hashGenerator.js";

/**
 * Verify an uploaded certificate against an original hash.
 * uploadedCertificate may be:
 * - a file path (string)
 * - a Buffer
 * - an object like multer's file: { path, buffer }
 *
 * Returns: { verified: boolean, message: string, computedHash }
 */
export async function verifyCertificate({ uploadedCertificate, originalHash }) {
  if (!originalHash) throw new Error("originalHash is required for verification");

  let base64;

  // Determine the type of uploadedCertificate
  if (!uploadedCertificate) throw new Error("uploadedCertificate is required");

  // If multer-style object
  if (typeof uploadedCertificate === "object" && uploadedCertificate !== null && (uploadedCertificate.buffer || uploadedCertificate.path)) {
    if (uploadedCertificate.buffer) {
      base64 = bufferToBase64(uploadedCertificate.buffer);
    } else if (uploadedCertificate.path) {
      base64 = await fileToBase64(uploadedCertificate.path);
    }
  } else if (typeof uploadedCertificate === "string") {
    // path
    if (!fs.existsSync(uploadedCertificate)) throw new Error("uploaded file path does not exist");
    base64 = await fileToBase64(uploadedCertificate);
  } else if (Buffer.isBuffer(uploadedCertificate)) {
    base64 = bufferToBase64(uploadedCertificate);
  } else {
    throw new TypeError("uploadedCertificate must be a file path, Buffer, or multer-like file object");
  }

  const computedHash = generateCertificateHash(base64);
  const verified = computedHash === String(originalHash).toLowerCase();

  return {
    verified,
    message: verified ? "Certificate is authentic" : "Certificate has been modified",
    computedHash,
  };
}

export default verifyCertificate;
