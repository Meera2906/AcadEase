import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const ASSESSMENT_TYPES = ["IA1", "IA2", "Assignment", "Lab Record", "Model Exam"];

export default function FacultyResultEntry() {
  const [courseId, setCourseId]       = useState("CS301");
  const [assessments, setAssessments] = useState([]);
  const [selected, setSelected]       = useState(null);
  const [entries, setEntries]         = useState([]);
  const [newA, setNewA]               = useState({ type: "IA1", title: "", maxMarks: "" });
  const [showCreate, setShowCreate]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const { toast, showToast, clearToast } = useToast();

  async function loadAssessments() {
    try {
      const res = await api.get(`/assessments/course/${courseId}`);
      setAssessments(res.data.assessments);
    } catch {
      showToast("Failed to load assessments.", "error");
    }
  }

  useEffect(() => { if (courseId) loadAssessments(); }, [courseId]);

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

  function openMarkEntry(assessment) {
    setSelected(assessment);
    setEntries([{ studentId: "", marksObtained: "", isAbsent: false }]);
  }

  function addRow() { setEntries((p) => [...p, { studentId: "", marksObtained: "", isAbsent: false }]); }

  function updateEntry(i, field, value) {
    setEntries((p) => p.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  }

  async function submitMarks(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = entries
        .filter((e) => e.studentId.trim())
        .map((e) => ({ studentId: e.studentId.trim(), marksObtained: e.isAbsent ? null : Number(e.marksObtained), isAbsent: e.isAbsent }));
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
                  {!a.marksPublished && (
                    <Button variant="secondary" size="sm" onClick={() => openMarkEntry(a)}>Enter Marks</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

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

      {selected && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-40 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-lift">
            <h2 className="font-display text-lg font-bold text-text-primary mb-1">Enter Marks</h2>
            <p className="text-sm text-text-muted mb-4">{selected.title} · Max: {selected.maxMarks}</p>
            <form onSubmit={submitMarks} className="space-y-3">
              {entries.map((entry, i) => (
                <div key={i} className="flex items-center gap-3">
                  <input placeholder="Student ID" value={entry.studentId} onChange={(e) => updateEntry(i, "studentId", e.target.value)} className="input flex-1 font-mono" />
                  <input type="number" placeholder="Marks" min="0" max={selected.maxMarks} disabled={entry.isAbsent} value={entry.isAbsent ? "" : entry.marksObtained} onChange={(e) => updateEntry(i, "marksObtained", e.target.value)} className="input w-24 disabled:bg-paper" />
                  <label className="flex items-center gap-1 text-xs text-text-muted whitespace-nowrap">
                    <input type="checkbox" checked={entry.isAbsent} onChange={(e) => updateEntry(i, "isAbsent", e.target.checked)} /> AB
                  </label>
                </div>
              ))}
              <Button type="button" variant="ghost" onClick={addRow} size="sm">+ Add student</Button>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={submitting} className="flex-1">{submitting ? "Publishing…" : "Publish Marks"}</Button>
                <Button type="button" variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
