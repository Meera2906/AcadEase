import { useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import AttendanceRing from "../../components/ui/AttendanceRing.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const REASON_TYPES = ["Placement Drive", "Medical", "Event", "Personal", "Other"];

export default function StudentAttendance() {
  const { user } = useAuth();
  const [summary, setSummary]     = useState(null);
  const [odRequests, setOdRequests] = useState([]);
  const [tab, setTab]             = useState("subjects");
  const [loading, setLoading]     = useState(true);
  const [showOdForm, setShowOdForm] = useState(false);
  const [odForm, setOdForm]       = useState({ courseId: "", date: "", reasonType: "", reasonDetails: "" });
  const [submitting, setSubmitting] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  async function loadData() {
    const [s, od] = await Promise.all([
      api.get(`/attendance/student/${user.userId}/summary`),
      api.get(`/attendance/od-requests/student/${user.userId}`),
    ]);
    setSummary(s.data);
    setOdRequests(od.data.requests);
  }

  useEffect(() => {
    if (!user) return;
    loadData().finally(() => setLoading(false));
  }, [user]);

  async function submitOd(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/attendance/od-request", { ...odForm, facultyId: "" });
      showToast("OD request submitted successfully.", "success");
      setShowOdForm(false);
      setOdForm({ courseId: "", date: "", reasonType: "", reasonDetails: "" });
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to submit OD request.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const belowThreshold = summary?.subjects?.filter((s) => s.percentage < 75) || [];

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Attendance</h1>
          <p className="text-sm text-text-secondary mt-0.5">Track your attendance across all subjects.</p>
        </div>
        <Button onClick={() => setShowOdForm(true)} className="flex items-center gap-2">
          <Plus size={15} /> OD Request
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-28 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : (
        <>
          {belowThreshold.length > 0 && (
            <div className="mb-6 flex items-start gap-3 bg-[#FFE7E9] text-danger rounded-card px-4 py-3.5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm font-medium space-y-1">
                {belowThreshold.map((s) => {
                  const needed = s.total > 0 ? Math.max(0, Math.ceil(0.75 * (s.total + 10) - s.attended)) : 0;
                  return (
                    <p key={s.courseId}>
                      <strong>{s.courseName}</strong> — {s.percentage}% · Need {needed} more classes to reach 75%.
                    </p>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white border border-border p-1 rounded-pill w-fit">
            {[
              { key: "subjects", label: "Subjects" },
              { key: "od", label: `OD Requests (${odRequests.length})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-1.5 rounded-pill text-sm font-medium transition-all ${
                  tab === key
                    ? "bg-ink text-white shadow-card"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "subjects" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary?.subjects?.map((s) => (
                <Card key={s.courseId} hover className="flex items-center gap-4 p-5">
                  <AttendanceRing percentage={s.percentage} size={68} stroke={6} />
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">{s.courseName}</p>
                    <p className="text-xs text-text-muted mt-0.5">{s.attended} / {s.total} classes</p>
                    {s.percentage < 75 && (
                      <p className="text-xs text-danger font-medium mt-1">⚠ Below 75%</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === "od" && (
            <div className="space-y-3">
              {odRequests.length === 0 && (
                <p className="text-text-muted text-sm py-8 text-center">No OD requests submitted yet.</p>
              )}
              {odRequests.map((r) => (
                <Card key={r._id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-text-primary text-sm font-mono">{r.courseId}</p>
                      <p className="text-xs text-text-muted mt-0.5">{new Date(r.date).toDateString()} · {r.reasonType}</p>
                      {r.reasonDetails && <p className="text-xs text-text-secondary mt-1">{r.reasonDetails}</p>}
                      {r.facultyNote && <p className="text-xs text-text-muted mt-1 italic">Faculty: {r.facultyNote}</p>}
                    </div>
                    <Badge status={r.status} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {showOdForm && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-40 p-4">
          <Card className="w-full max-w-md shadow-lift">
            <h2 className="font-display text-lg font-bold text-text-primary mb-4">Submit OD / Late Request</h2>
            <form onSubmit={submitOd} className="space-y-4">
              <div>
                <label className="label">Course ID</label>
                <input required value={odForm.courseId} onChange={(e) => setOdForm({ ...odForm, courseId: e.target.value })} placeholder="e.g. CS301" className="input font-mono" />
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" required value={odForm.date} onChange={(e) => setOdForm({ ...odForm, date: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">Reason Type</label>
                <select required value={odForm.reasonType} onChange={(e) => setOdForm({ ...odForm, reasonType: e.target.value })} className="input">
                  <option value="">Select reason</option>
                  {REASON_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Details <span className="text-text-muted font-normal">(optional)</span></label>
                <textarea value={odForm.reasonDetails} onChange={(e) => setOdForm({ ...odForm, reasonDetails: e.target.value })} maxLength={300} rows={3} className="input" />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={submitting} className="flex-1">{submitting ? "Submitting…" : "Submit Request"}</Button>
                <Button type="button" variant="secondary" onClick={() => setShowOdForm(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
