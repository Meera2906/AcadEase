import path from "path";

export function isSafeUploadName(fileName = "") {
  const baseName = path.basename(fileName || "");
  return Boolean(baseName) && baseName === fileName && !baseName.includes("..") && /^[A-Za-z0-9._ -]+$/.test(baseName);
}

export function validateUploadedFile(file, { allowedExtensions = [], allowedMimeTypes = [] } = {}) {
  if (!file) {
    return { ok: false, reason: "No file uploaded" };
  }

  const originalName = file.originalname || "";
  const extension = path.extname(originalName).toLowerCase();
  const mimeType = (file.mimetype || "").toLowerCase();

  if (!isSafeUploadName(originalName)) {
    return { ok: false, reason: "Invalid file name" };
  }

  if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
    return { ok: false, reason: `Unsupported file type. Allowed: ${allowedExtensions.join(", ")}` };
  }

  if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(mimeType)) {
    return { ok: false, reason: "Unsupported file MIME type" };
  }

  return { ok: true };
}
