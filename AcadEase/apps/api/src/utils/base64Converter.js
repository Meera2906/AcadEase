import fs from "fs";

/**
 * Convert a file on disk to Base64 string.
 * Accepts a file path and returns a Promise<string> with Base64 contents.
 */
export async function fileToBase64(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data.toString("base64"));
    });
  });
}

/**
 * Convert a Buffer to Base64 string.
 */
export function bufferToBase64(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("Expected a Buffer");
  }
  return buffer.toString("base64");
}

export default { fileToBase64, bufferToBase64 };
