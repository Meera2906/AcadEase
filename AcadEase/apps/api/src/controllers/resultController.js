import { Result } from "../models/index.js";

// POST /api/results/semester
export async function enterSemesterResult(req, res) {
  const { studentId, semester, academicYear, subjects } = req.body;
  if (!studentId || !semester || !academicYear || !Array.isArray(subjects)) {
    return res.status(400).json({ error: "studentId, semester, academicYear, subjects[] are required" });
  }

  const result = await Result.findOneAndUpdate(
    { studentId, semester, academicYear },
    { $set: { subjects, enteredBy: req.user.userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ result });
}

// GET /api/results/student/:studentId
export async function getStudentResults(req, res) {
  const { studentId } = req.params;
  const results = await Result.find({ studentId, releasedAt: { $ne: null } }).sort({ semester: 1 });
  res.json({ results });
}
