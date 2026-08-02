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
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const accent = "#1D4ED8";
  const accentSoft = "#E8ECFF";
  const ink = "#0F172A";
  const muted = "#64748B";
  const borderColor = "#C7D2FE";
  const institutionName = process.env.INSTITUTION_NAME || "AcadEase";

  // Outer border and header panel
  doc.rect(28, 28, pageWidth - 56, pageHeight - 56).lineWidth(2).stroke(borderColor);
  doc.rect(40, 40, pageWidth - 80, 110).fill(accentSoft);
  doc.rect(40, 150, pageWidth - 80, 320).fill("#FFFFFF");
  doc.rect(40, pageHeight - 88, pageWidth - 80, 48).fill(ink);

  // Subtle institutional watermark
  doc.save();
  doc.fillOpacity(0.08);
  doc.fontSize(72).fillColor(accent);
  doc.text(institutionName, 40, 220, { align: "center", width: 762 });
  doc.restore();

  doc.fillOpacity(1);
  doc.fillColor(accent).fontSize(12).font("Helvetica-Bold").text("OFFICIAL CERTIFICATE", 60, 62);
  doc.fillColor(ink).fontSize(24).font("Helvetica-Bold").text(institutionName, 60, 82);
  doc.fillColor(muted).fontSize(13).font("Helvetica").text(certificateTitle(cert.type), 60, 110);

  // Main certificate body
  doc.fillColor(muted).fontSize(16).font("Helvetica").text("This is to certify that", 70, 180);
  doc.fillColor(ink).fontSize(28).font("Helvetica-Bold").text(cert.studentName, 70, 208);
  doc.fontSize(12).fillColor(muted).text(`has successfully been recognized for ${String(cert.purpose).toLowerCase()} purposes.`, 70, 248);

  doc.moveTo(70, 280).lineTo(pageWidth - 70, 280).stroke("#E2E8F0");

  doc.fontSize(11).fillColor(ink);
  const details = [
    ["Certificate ID", cert.certId],
    ["Enrollment Number", cert.enrollmentNumber],
    ["Department", cert.department],
    ["Academic Year", cert.academicYear],
    ["Issued On", new Date(cert.issuedAt).toDateString()],
  ];

  details.forEach(([label, value], index) => {
    const y = 300 + index * 26;
    doc.font("Helvetica-Bold").text(`${label}:`, 70, y, { continued: true });
    doc.font("Helvetica").text(` ${String(value)}`);
  });

  // Decorative seal and signatures
  doc.circle(pageWidth - 140, pageHeight - 190, 54).lineWidth(2).stroke(accent);
  doc.circle(pageWidth - 140, pageHeight - 190, 42).lineWidth(1).stroke("#CBD5E1");
  doc.fillColor(accent).fontSize(11).font("Helvetica-Bold").text("VALID", pageWidth - 160, pageHeight - 206, { align: "center", width: 40 });
  doc.fillColor(accent).fontSize(11).font("Helvetica-Bold").text("CERTIFIED", pageWidth - 160, pageHeight - 188, { align: "center", width: 40 });

  // ── Counter-signature block ──
  // Every institution that authorised this certificate, in the order they did,
  // each with the fingerprint of the key it signed with. A reader can take any
  // one of these to the public verify page and check it independently.
  const chain = (cert.approvalChain || []).filter((link) => link.decision === "approved");
  if (chain.length) {
    const blockX = 70;
    const blockY = pageHeight - 250;
    doc.fillColor(muted).fontSize(8).font("Helvetica-Bold")
      .text("COUNTER-SIGNED BY", blockX, blockY);

    chain.slice(0, 3).forEach((link, index) => {
      const y = blockY + 14 + index * 30;
      const authority = link.keyId === "tnteu" ? "TNTEU" : link.keyId;
      doc.fillColor(ink).fontSize(9).font("Helvetica-Bold")
        .text(`${index + 1}. ${authority}`, blockX, y, { width: 340 });
      doc.fillColor(muted).fontSize(7.5).font("Helvetica")
        .text(
          `${link.actorName || link.actorId} · ${new Date(link.decidedAt).toDateString()} · ${link.algorithm} · key ${String(link.keyFingerprint || "").slice(0, 16)}`,
          blockX + 12,
          y + 11,
          { width: 330 }
        );
    });
  }

  doc.moveTo(70, pageHeight - 140).lineTo(260, pageHeight - 140).stroke(ink);
  doc.fillColor(muted).fontSize(9).text("Authorized Signatory", 70, pageHeight - 122);
  doc.fillColor(ink).fontSize(11).font("Helvetica-Bold").text(institutionName, 70, pageHeight - 104);

  doc.moveTo(pageWidth - 280, pageHeight - 140).lineTo(pageWidth - 90, pageHeight - 140).stroke(ink);
  doc.fillColor(muted).fontSize(9).text("Issue Date", pageWidth - 280, pageHeight - 122);
  doc.fillColor(ink).fontSize(11).font("Helvetica-Bold").text(new Date(cert.issuedAt).toDateString(), pageWidth - 280, pageHeight - 104);

  // QR and verification footer
  doc.image(qrBuffer, pageWidth - 180, pageHeight - 220, { width: 100 });
  doc.fillColor(muted).fontSize(9).text("Scan to verify authenticity", pageWidth - 190, pageHeight - 110);

  doc.fontSize(8).fillColor("#94A3B8").text(
    `Verified at ${verifyUrl}`,
    70,
    pageHeight - 84,
    { width: pageWidth - 160 }
  );
  doc.fillColor("#FFFFFF").fontSize(10).text("Digitally signed and issued by AcadEase", 70, pageHeight - 58);

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  // Hash the finished file. Verification proves the *record* is genuine; this
  // is what additionally proves the PDF in someone's hand is the exact file we
  // produced, rather than a re-typed lookalike carrying a real QR code.
  const pdfHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

  return { pdfPath: toPublicStoragePath(filePath), verifyUrl, pdfHash };
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
