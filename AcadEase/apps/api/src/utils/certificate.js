import fs from "fs";
import path from "path";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";

const STORAGE_DIR = path.resolve("storage", "certificates");

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export function toPublicStoragePath(filePath) {
  const normalized = path.normalize(filePath).replace(/\\/g, "/");
  const storageRoot = path.resolve("storage").replace(/\\/g, "/");

  if (normalized.startsWith(storageRoot + "/")) {
    return normalized.replace(storageRoot + "/", "storage/");
  }

  if (normalized.startsWith("storage/")) {
    return normalized;
  }

  return normalized;
}

// Anti-spoofing layer (PRD Section 5.4.3):
// certId (UUIDv4) + HMAC-SHA256 signature over the immutable fields,
// embedded in a QR code that resolves to the public /verify/:certId page.
export function generateCertId() {
  return uuidv4();
}

export function signCertificate({ certId, studentId, issuedAt, type, institutionId }) {
  const secret = process.env.CERT_HMAC_SECRET;
  if (!secret) throw new Error("CERT_HMAC_SECRET is not set");
  const payload = `${certId}|${studentId}|${new Date(issuedAt).toISOString()}|${type}|${institutionId}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyCertificateSignature(cert) {
  const expected = signCertificate({
    certId: cert.certId,
    studentId: cert.studentId,
    issuedAt: cert.issuedAt,
    type: cert.type,
    institutionId: cert.institutionId,
  });
  return expected === cert.hmacSignature;
}

// Server-side PDF generation only — PRD is explicit that certificates must
// never be generated client-side (Section 5.4.3 "Server-side PDF generation").
export async function generateCertificatePdf(cert, { verifyBaseUrl }) {
  ensureStorageDir();

  const verifyUrl = `${verifyBaseUrl.replace(/\/$/, "")}/verify/${cert.certId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

  const filePath = path.join(STORAGE_DIR, `${cert.certId}.pdf`);
  const doc = new PDFDocument({ size: "A4", margin: 60 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Faint institution watermark (visual anti-forgery layer)
  doc.save();
  doc.fillOpacity(0.06);
  doc.fontSize(72).fillColor("#1D4ED8");
  doc.text(process.env.INSTITUTION_NAME || "AcadEase", 40, 320, { align: "center", width: 520 });
  doc.restore();

  doc.fillOpacity(1).fillColor("#0F172A");
  doc.fontSize(20).text(process.env.INSTITUTION_NAME || "Institution Name", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(14).fillColor("#475569").text(certificateTitle(cert.type), { align: "center" });
  doc.moveDown(2);

  doc.fontSize(11).fillColor("#0F172A");
  const lines = [
    ["Certificate ID", cert.certId],
    ["Student Name", cert.studentName],
    ["Enrollment Number", cert.enrollmentNumber],
    ["Department", cert.department],
    ["Academic Year", cert.academicYear],
    ["Purpose", cert.purpose],
    ["Issued On", new Date(cert.issuedAt).toDateString()],
  ];
  lines.forEach(([label, value]) => {
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(String(value));
  });

  doc.moveDown(1.5);
  doc.fontSize(9).fillColor("#94A3B8").text(
    "This certificate is digitally issued and signed. Scan the QR code or visit the link below to verify authenticity.",
    { width: 520 }
  );
  doc.fontSize(9).fillColor("#1D4ED8").text(verifyUrl, { width: 520 });

  doc.image(qrBuffer, doc.page.width - 180, doc.page.height - 220, { width: 120 });

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return { pdfPath: toPublicStoragePath(filePath), verifyUrl };
}

function certificateTitle(type) {
  const titles = {
    bonafide: "Bonafide Certificate",
    completion: "Course Completion Certificate",
    attendance: "Attendance Certificate",
    character: "Character Certificate",
    merit: "Merit Certificate",
  };
  return titles[type] || "Certificate";
}

export function issueSignedDownloadToken() {
  const token = crypto.randomBytes(24).toString("hex");
  const hours = Number(process.env.CERT_DOWNLOAD_URL_EXPIRES_HOURS || 24);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  return { token, expiresAt };
}
