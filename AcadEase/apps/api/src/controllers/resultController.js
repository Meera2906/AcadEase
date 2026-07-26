import { Result, Marks, Assessment, Course } from "../models/index.js";

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

// GET /api/results/student/:studentId  — semester (university) results
export async function getStudentResults(req, res) {
  const { studentId } = req.params;
  // Students can see their own results; admins/faculty can see any
  const isSelf = req.user.userId === studentId;
  const filter = isSelf
    ? { studentId }                              // own: show all (released or not for demo)
    : { studentId, releasedAt: { $ne: null } };  // others: only released
  const results = await Result.find(filter).sort({ academicYear: 1, semester: 1 });
  res.json({ results });
}

// GET /api/results/student/:studentId/sessions
// Returns distinct {academicYear, semester, semesterLabel} pairs that have
// either internal marks or semester results — used to populate the dropdown.
export async function getStudentSessions(req, res) {
  const { studentId } = req.params;

  // Sessions from internal marks (via enrolled courses)
  const marks = await Marks.find({ studentId }).populate("assessmentId", "courseId");
  const courseIds = [...new Set(marks.map((m) => m.assessmentId?.courseId).filter(Boolean))];
  const courses = await Course.find({ courseId: { $in: courseIds } });

  const internalSessions = new Map();
  for (const c of courses) {
    const key = `${c.academicYear}__${c.semester}`;
    if (!internalSessions.has(key)) {
      internalSessions.set(key, { academicYear: c.academicYear, semester: c.semester });
    }
  }

  // Sessions from semester results
  const semResults = await Result.find({ studentId }).select("academicYear semester");
  const semSessions = new Map();
  for (const r of semResults) {
    const key = `${r.academicYear}__${r.semester}`;
    if (!semSessions.has(key)) {
      semSessions.set(key, { academicYear: r.academicYear, semester: r.semester });
    }
  }

  // Merge and sort
  const allKeys = new Set([...internalSessions.keys(), ...semSessions.keys()]);
  const sessions = [...allKeys]
    .map((key) => {
      const s = internalSessions.get(key) || semSessions.get(key);
      return {
        academicYear: s.academicYear,
        semester: s.semester,
        semesterType: s.semester % 2 !== 0 ? "ODD" : "EVEN",
        hasInternal: internalSessions.has(key),
        hasSemResult: semSessions.has(key),
        label: `${s.academicYear} — Sem ${s.semester} (${s.semester % 2 !== 0 ? "ODD" : "EVEN"})`,
      };
    })
    .sort((a, b) =>
      a.academicYear.localeCompare(b.academicYear) || a.semester - b.semester
    );

  res.json({ sessions });
}
