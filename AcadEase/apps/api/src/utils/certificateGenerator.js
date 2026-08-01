import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { bufferToBase64, fileToBase64 } from "./base64Converter.js";
import { generateCertificateHash } from "./hashGenerator.js";

const STORAGE_DIR = path.resolve("storage", "certificates");

function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/**
 * Generate a PDF certificate from provided student data.
 * Returns { filePath, fileName, storagePath, base64, hash }
 * - base64 and hash are optional but included for convenience so caller can store the hash externally.
 *
 * Input object shape:
 * {
 *   studentName,
 *   studentId,
 *   department,
 *   institution,
 *   cgpa,
 *   certificateId,
 *   issueDate
 * }
 */
export async function generateCertificatePdf(data = {}) {
  ensureDir();

  const {
    studentName = "",
    studentId = "",
    department = "",
    institution = process.env.INSTITUTION_NAME || "AcadEase",
    cgpa = "",
    certificateId = `CID_${Date.now()}_${Math.floor(Math.random()*10000)}`,
    issueDate = new Date().toDateString(),
  } = data;

  // Safe filename
  const safeCertId = String(certificateId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `CERT_${safeCertId}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);

  // Create a PDF document using pdfkit
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Simple professional certificate layout
  // Watermark
  doc.save().fillOpacity(0.05).fontSize(72).fillColor("#1D4ED8")
    .text(String(institution), 0, 250, { align: "center", width: 595 }).restore();

  doc.fillOpacity(1).fillColor("#0F172A");

  // Header
  doc.fontSize(20).font("Helvetica-Bold").text(String(institution), { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(14).font("Helvetica").fillColor("#475569")
    .text("Certificate of Achievement", { align: "center" });
  doc.moveDown(0.8);

  // Body
  doc.fontSize(12).font("Helvetica");
  const body = `This is to certify that`;
  doc.text(body, { align: "center" });
  doc.moveDown(0.5);

  // Student name
  doc.fontSize(18).font("Helvetica-Bold").text(String(studentName), { align: "center" });
  doc.moveDown(0.5);

  doc.fontSize(12).font("Helvetica").text(
    `Student ID: ${studentId}   |   Department: ${department}   |   CGPA: ${cgpa}`,
    { align: "center" }
  );

  doc.moveDown(1);
  doc.fontSize(11).text(
    `Has been awarded this certificate (Certificate ID: ${certificateId}) on ${issueDate}.`, { align: "center" }
  );

  doc.moveDown(3);

  // Signature placeholder
  const sigY = doc.y;
  doc.moveTo(120, sigY).lineTo(260, sigY).strokeColor("#000").stroke();
  doc.fontSize(10).text("Registrar", 140, sigY + 5);

  doc.moveTo(335, sigY).lineTo(475, sigY).strokeColor("#000").stroke();
  doc.fontSize(10).text("Controller of Examinations", 350, sigY + 5);

  doc.moveDown(4);
  doc.fontSize(8).fillColor("#94a3b8").text("This is a computer generated certificate.", { align: "center" });

  doc.end();

  // Wait for stream finish
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  // Convert to base64 and compute hash to return
  const base64 = await fileToBase64(filePath);
  const hash = generateCertificateHash(base64);

  return { filePath, fileName, storagePath: `storage/certificates/${fileName}`, base64, hash };
}

export default generateCertificatePdf;
