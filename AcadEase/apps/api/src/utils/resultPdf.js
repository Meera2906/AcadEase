import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

const STORAGE_DIR = path.resolve("storage", "results");

function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const GRADE_POINTS = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, U: 0 };

export async function generateResultPdf({ student, result }) {
  ensureDir();

  const fileName = `${student.userId}_sem${result.semester}_${result.academicYear.replace(/[^a-z0-9]/gi, "_")}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const institution = process.env.INSTITUTION_NAME || "AcadEase";

  // Watermark
  doc.save().fillOpacity(0.05).fontSize(72).fillColor("#1D4ED8")
    .text(institution, 40, 300, { align: "center", width: 500 }).restore();

  doc.fillOpacity(1).fillColor("#0F172A");

  // Header
  doc.fontSize(18).font("Helvetica-Bold").text(institution, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(13).font("Helvetica").fillColor("#475569")
    .text("Semester Examination Result", { align: "center" });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
  doc.moveDown(0.5);

  // Student info
  doc.fontSize(10).fillColor("#0F172A");
  const info = [
    ["Student Name", student.name],
    ["Student ID", student.userId],
    ["Enrollment No.", student.enrollmentNumber || "—"],
    ["Department", student.department || student.departmentId],
    ["Semester", `Semester ${result.semester}`],
    ["Academic Year", result.academicYear],
    ["Published On", new Date(result.releasedAt || Date.now()).toDateString()],
  ];
  for (const [label, value] of info) {
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(String(value ?? "—"));
  }

  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
  doc.moveDown(0.5);

  // Subjects table header
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#64748b");
  const cols = { subject: 50, code: 230, marks: 310, grade: 370, points: 420, result: 480 };
  doc.text("Subject", cols.subject, doc.y, { continued: false });
  const headerY = doc.y - doc.currentLineHeight();
  doc.text("Code", cols.code, headerY);
  doc.text("Marks", cols.marks, headerY);
  doc.text("Grade", cols.grade, headerY);
  doc.text("GP", cols.points, headerY);
  doc.text("Result", cols.result, headerY);
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
  doc.moveDown(0.3);

  // Subject rows
  const subjects = result.subjects || [];
  doc.font("Helvetica").fillColor("#0F172A");
  for (const sub of subjects) {
    const rowY = doc.y;
    const gp = GRADE_POINTS[sub.grade] ?? "—";
    const marksStr = sub.marksObtained != null ? `${sub.marksObtained}/${sub.maxMarks ?? 100}` : "—";
    doc.fontSize(9).text(sub.courseName || sub.courseId || "—", cols.subject, rowY, { width: 175 });
    doc.text(sub.courseId || "—", cols.code, rowY, { width: 75 });
    doc.text(marksStr, cols.marks, rowY, { width: 55 });
    doc.text(sub.grade || "—", cols.grade, rowY, { width: 45 });
    doc.text(String(gp), cols.points, rowY, { width: 45 });
    const resultColor = sub.result === "pass" ? "#16a34a" : sub.result === "fail" ? "#dc2626" : "#94a3b8";
    doc.fillColor(resultColor).text(sub.result?.toUpperCase() || "—", cols.result, rowY, { width: 55 });
    doc.fillColor("#0F172A");
    doc.moveDown(0.5);
  }

  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
  doc.moveDown(0.5);

  // Summary
  const passed = subjects.filter((s) => s.result === "pass").length;
  const failed = subjects.filter((s) => s.result === "fail").length;
  const totalObtained = subjects.reduce((s, sub) => s + (sub.marksObtained ?? 0), 0);
  const totalMax = subjects.reduce((s, sub) => s + (sub.maxMarks ?? 100), 0);
  const gpa = subjects.length
    ? (subjects.reduce((s, sub) => s + (GRADE_POINTS[sub.grade] ?? 0), 0) / subjects.length).toFixed(2)
    : "—";

  doc.fontSize(10).font("Helvetica-Bold");
  doc.text(`Total: ${totalObtained}/${totalMax}   |   GPA: ${gpa}/10   |   Passed: ${passed}   |   Arrears: ${failed}`, { align: "center" });

  doc.moveDown(2);
  doc.fontSize(8).font("Helvetica").fillColor("#94a3b8")
    .text("This is a computer-generated result document. — AcadEase", { align: "center" });

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return { filePath, fileName, storagePath: `storage/results/${fileName}` };
}
