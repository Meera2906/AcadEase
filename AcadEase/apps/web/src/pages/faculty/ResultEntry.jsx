import { useEffect, useState, useRef } from "react";
import { ClipboardList, Upload, Users, FileText, ExternalLink, AlertTriangle, Send } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const ASSESSMENT_TYPES = ["IA1", "IA2", "Assignment", "Lab Record", "Model Exam"];

export default function FacultyResultEntry() {
  const [courseId, setCourseId] = useState("CS301");
  const [assessments, setAssessments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [newA, setNewA] = useState({ type: "IA1", title: "", maxMarks: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const csvRef = useRef(null);
  const { toast, showToast, clearToast } = useToast();

  // Rejected results for this faculty
  const [rejectedResults, setRejectedResults] = useState([]);
  const [submittingReview, setSubmittingReview] = useState(null); // studentId being submitted

  const apiBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api$/, "");

  async function loadAssessments() {
    try {
      const res = await api.get(`/assessments/course/${courseId}`);
      setAssessments(res.data.assessments);
    } catch {
      showToast("Failed to load assessments.", "error");
    }
  }

  async function loadRejected() {
    try {
      const res = await api.get("/results/pending-review");
      setRejectedResults((res.data.results || []).filter((r) => r.status === "rejected"));
    } catch { /* non-fatal */ }
  }

  useEffect(() => { if (courseId) loadAssessments(); }, [courseId]);
  useEffect(() => { loadRejected(); }, []);

  async function handleSubmitForReview(studentId, semester, academicYear) {
    setSubmittingReview(studentId);
    try {
      await api.post(`/results/semester/${studentId}/submit-review`, { semester, academicYear });
      showToast("Submitted for admin review.", "success");
      loadRejected();
    } catch (ex) {
      showToast(ex.response?.data?.error || "Failed to submit.", "error");
    } finally {
      setSubmittingReview(null);
    }
  }

  async function createAssessment(e) {
    e.preventDefault();
    try {
      await api.post("/assessments", { ...newA, courseId, maxMarks: Number(newA.maxMarks) });
      showToast("Assessment created.", "success");
      setShowCreate(false);
      setNewA({ type: "IA1", title: "", maxMarks: "" });
      await loadAssessments();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to create assessment.", "error");
    }
  }

  async function openMarkEntry(assessment) {
    setSelected(assessment);
    setLoadingStudents(true);
    try {
      const res = await api.get(`/marks/assessment/${assessment._id}/students`);
      setEntries(
        res.data.rows.map((r) => ({
          studentId: r.studentId,
          name: r.name,
          enrollmentNumber: r.enrollmentNumber,
          resumePath: r.resumePath || null,
          marksObtained: r.marksObtained === "" ? "" : String(r.marksObtained),
          isAbsent: r.isAbsent,
        }))
      );
    } catch {
      showToast("Failed to load students.", "error");
      setSelected(null);
    } finally {
      setLoadingStudents(false);
    }
  }

  function updateEntry(i, field, value) {
    setEntries((p) => p.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  }

  // CSV format: enrollmentNumber,marks  (header row optional)
  function handleCsvImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/).filter(Boolean);
      const updates = {};
      for (const line of lines) {
        const [enroll, marks] = line.split(",").map((s) => s.trim());
        if (!enroll || enroll.toLowerCase() === "enrollmentnumber") continue;
        updates[enroll.toLowerCase()] = marks;
      }
      setEntries((prev) =>
        prev.map((row) => {
          const key = (row.enrollmentNumber || row.studentId).toLowerCase();
          if (key in updates) {
            const val = updates[key];
            const isAbsent = val?.toLowerCase() === "ab" || val?.toLowerCase() === "absent";
            return { ...row, isAbsent, marksObtained: isAbsent ? "" : val };
          }
          return row;
        })
      );
      showToast("CSV imported. Review before publishing.", "success");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function submitMarks(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = entries.map((e) => ({
        studentId: e.studentId,
        marksObtained: e.isAbsent ? null : e.marksObtained === "" ? null : Number(e.marksObtained),
        isAbsent: e.isAbsent,
      }));
      await api.post(`/marks/${selected._id}`, { entries: payload });
      showToast("Marks published successfully.", "success");
      setSelected(null);
      await loadAssessments();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to submit marks.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <div className="flex items-center gap-2 mb-1">
        <ClipboardList size={20} className="text-signal" />
        <h1 className="font-display text-2xl font-bold text-text-primary">Result Entry</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6">Create assessments and publish marks.</p>

      {/* Rejected results banner */}
      {rejectedResults.length > 0 && (
        <div className="mb-6 space-y-3">
          {rejectedResults.map((r) => (
            <div key={`${r.studentId}-${r.semester}`} className="flex items-start gap-3 bg-danger/5 border border-danger/30 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-danger">Result Rejected — Correction Required</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  <span className="font-mono">{r.studentId}</span> — Sem {r.semester} ({r.academicYear})
                </p>
                <p className="text-xs text-text-primary mt-1 bg-danger/10 rounded-lg px-2 py-1 inline-block">
                  Reason: {r.rejectionNote}
                </p>
              </div>
              <Button
                size="sm"
                disabled={submittingReview === r.studentId}
                onClick={() => handleSubmitForReview(r.studentId, r.semester, r.academicYear)}
                className="flex items-center gap-1 shrink-0"
              >
                <Send size={12} />
                {submittingReview === r.studentId ? "Submitting…" : "Resubmit"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Card className="mb-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="label">Course ID</label>
            <input value={courseId} onChange={(e) => setCourseId(e.target.value)} className="input font-mono" />
          </div>
          <Button variant="secondary" onClick={loadAssessments}>Load</Button>
          <Button onClick={() => setShowCreate(true)}>+ New Assessment</Button>
        </div>
      </Card>

      {assessments.length === 0 ? (
        <p className="text-text-muted text-sm">No assessments for this course yet.</p>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <Card key={a._id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-text-primary">{a.title}</p>
                  <p className="text-xs text-text-muted">{a.type} · Max: {a.maxMarks}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge status={a.marksPublished ? "approved" : "pending"}>
                    {a.marksPublished ? "Published" : "Pending"}
                  </Badge>
                  <Button variant="secondary" size="sm" onClick={() => openMarkEntry(a)}>
                    {a.marksPublished ? "View / Edit Marks" : "Enter Marks"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Assessment Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-40 p-4">
          <Card className="w-full max-w-md shadow-lift">
            <h2 className="font-display text-lg font-bold text-text-primary mb-4">New Assessment</h2>
            <form onSubmit={createAssessment} className="space-y-4">
              <div>
                <label className="label">Type</label>
                <select value={newA.type} onChange={(e) => setNewA({ ...newA, type: e.target.value })} className="input">
                  {ASSESSMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Title</label>
                <input required value={newA.title} onChange={(e) => setNewA({ ...newA, title: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">Max Marks</label>
                <input required type="number" min="1" value={newA.maxMarks} onChange={(e) => setNewA({ ...newA, maxMarks: e.target.value })} className="input" />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="submit" className="flex-1">Create</Button>
                <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Mark Entry Modal */}
      {selected && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-40 p-4">
          <Card className="w-full max-w-3xl max-h-[92vh] flex flex-col shadow-lift">
            {/* Header */}
            <div className="flex items-start justify-between mb-1 shrink-0">
              <div>
                <h2 className="font-display text-lg font-bold text-text-primary">Enter Marks</h2>
                <p className="text-sm text-text-muted">{selected.title} · Max: {selected.maxMarks}</p>
              </div>
              <div className="flex items-center gap-2">
                <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => csvRef.current?.click()}
                >
                  <Upload size={13} className="mr-1" /> Import CSV
                </Button>
              </div>
            </div>

            <p className="text-xs text-text-muted mb-3 shrink-0">
              CSV format: <code className="bg-paper px-1 rounded">enrollmentNumber,marks</code> — use <code className="bg-paper px-1 rounded">AB</code> for absent.
            </p>

            {loadingStudents ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-signal/30 border-t-signal rounded-full animate-spin" />
              </div>
            ) : (
              <form onSubmit={submitMarks} className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <Users size={14} className="text-text-muted" />
                  <span className="text-xs text-text-muted">{entries.length} students loaded</span>
                </div>

                <div className="overflow-y-auto flex-1 border border-border rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-paper border-b border-border">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted w-8">#</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted">Name</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted">Reg. No.</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-text-muted w-16">Doc</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-text-muted w-24">Marks</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-text-muted w-14">AB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {entries.map((entry, i) => (
                        <tr key={entry.studentId} className={entry.isAbsent ? "bg-danger/5" : ""}>
                          <td className="px-3 py-2 text-xs text-text-muted tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-text-primary">{entry.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-text-muted">{entry.enrollmentNumber}</td>
                          <td className="px-3 py-2 text-center">
                            {entry.resumePath ? (
                              <a
                                href={`${apiBase}/${entry.resumePath}`}
                                target="_blank"
                                rel="noreferrer"
                                title="View resume"
                                className="inline-flex items-center justify-center text-signal hover:text-signal/80"
                              >
                                <FileText size={15} />
                              </a>
                            ) : (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              max={selected.maxMarks}
                              disabled={entry.isAbsent}
                              value={entry.isAbsent ? "" : entry.marksObtained}
                              onChange={(e) => updateEntry(i, "marksObtained", e.target.value)}
                              className="input w-full text-center py-1 disabled:bg-paper"
                              placeholder="—"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={entry.isAbsent}
                              onChange={(e) => updateEntry(i, "isAbsent", e.target.checked)}
                              className="w-4 h-4 accent-danger"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 pt-4 shrink-0">
                  <Button type="submit" disabled={submitting} className="flex-1">
                    {submitting ? "Publishing…" : "Publish Marks"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
