import { useEffect, useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const REASON_TYPES = ["Placement Drive", "Medical", "Event", "Personal", "Other"];

export default function StudentOdRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ courseId: "", date: "", reasonType: "", reasonDetails: "" });
  const [submitting, setSubmitting] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  async function load() {
    const [reqRes, attRes] = await Promise.all([
      api.get(`/attendance/od-requests/student/${user.userId}`),
      api.get(`/attendance/student/${user.userId}/summary`).catch(() => ({ data: { subjects: [] } })),
    ]);
    setRequests(reqRes.data.requests || []);
    setCourses(attRes.data.subjects || []);
  }

  useEffect(() => {
    if (!user) return;
    load().finally(() => setLoading(false));
  }, [user]);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/attendance/od-request", form);
      showToast("OD request submitted.", "success");
      setShowForm(false);
      setForm({ courseId: "", date: "", reasonType: "", reasonDetails: "" });
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to submit OD request.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">OD Requests</h1>
          <p className="text-sm text-text-secondary mt-0.5">Submit and track your on-duty requests.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
          <Plus size={15} /> New OD Request
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <p className="text-text-muted text-sm py-12 text-center">No OD requests submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r._id} className="p-4">
              <button className="w-full text-left" onClick={() => setExpanded(expanded === r._id ? null : r._id)}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-text-primary text-sm">{r.courseId}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {r.reasonType} · {new Date(r.date).toDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge status={r.status} />
                    {expanded === r._id ? <ChevronUp size={15} className="text-text-muted" /> : <ChevronDown size={15} className="text-text-muted" />}
                  </div>
                </div>
              </button>

              {expanded === r._id && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {r.reasonDetails && <p className="text-sm text-text-secondary">{r.reasonDetails}</p>}
                  {r.facultyNote && (
                    <div className="bg-paper rounded-card px-3 py-2">
                      <p className="text-xs font-semibold text-text-muted mb-0.5">Faculty Note</p>
                      <p className="text-sm text-text-secondary">{r.facultyNote}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-40 p-4">
          <Card className="w-full max-w-md shadow-lift">
            <h2 className="font-display text-lg font-bold text-text-primary mb-4">Submit OD Request</h2>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Course</label>
                <select required value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="input">
                  <option value="">Select course</option>
                  {courses.map((c) => (
                    <option key={c.courseId} value={c.courseId}>{c.courseName} ({c.courseId})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Date of Absence</label>
                <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">Reason Type</label>
                <select required value={form.reasonType} onChange={(e) => setForm({ ...form, reasonType: e.target.value })} className="input">
                  <option value="">Select reason</option>
                  {REASON_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Details <span className="text-text-muted font-normal">(optional)</span></label>
                <textarea maxLength={300} rows={3} value={form.reasonDetails} onChange={(e) => setForm({ ...form, reasonDetails: e.target.value })} className="input" />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={submitting} className="flex-1">{submitting ? "Submitting…" : "Submit"}</Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
