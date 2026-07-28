import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Plus, FileText, ExternalLink, ChevronDown, ChevronUp, Upload, X } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import AttendanceRing from "../../components/ui/AttendanceRing.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const REASON_TYPES = ["Placement Drive", "Medical", "Event", "Personal", "Other"];
const apiBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api$/, "");

export default function StudentAttendance() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState({});   // byCourse raw records
  const [odRequests, setOdRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState(null);
  // dispute form state: keyed by attendanceRecordId
  const [disputeOpen, setDisputeOpen] = useState(null);
  const [disputeForm, setDisputeForm] = useState({ reasonType: "", reasonDetails: "" });
  const [disputeFile, setDisputeFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const disputeFileRef = useRef(null);

  // new OD form (manual)
  const [showOdForm, setShowOdForm] = useState(false);
  const [odForm, setOdForm] = useState({ courseId: "", date: "", reasonType: "", reasonDetails: "" });
  const [odFile, setOdFile] = useState(null);
  const [odSubmitting, setOdSubmitting] = useState(false);
  const odFileRef = useRef(null);

  const { toast, showToast, clearToast } = useToast();

  async function loadData() {
    const [s, rec, od] = await Promise.all([
      api.get(`/attendance/student/${user.userId}/summary`),
      api.get(`/attendance/student/${user.userId}`),
      api.get(`/attendance/od-requests/student/${user.userId}`),
    ]);
    setSummary(s.data);
    setRecords(rec.data.byCourse || {});
    setOdRequests(od.data.requests || []);
  }

  useEffect(() => {
    if (!user) return;
    loadData().finally(() => setLoading(false));
  }, [user]);

  // Get absent records for a course that don't already have a pending/approved OD
  function getDisputeableAbsents(courseId) {
    const courseRecords = records[courseId] || [];
    const coveredDates = new Set(
      odRequests
        .filter((r) => r.courseId === courseId && r.status !== "rejected")
        .map((r) => new Date(r.date).toISOString().slice(0, 10))
    );
    return courseRecords.filter(
      (r) => r.status === "absent" && !coveredDates.has(new Date(r.date).toISOString().slice(0, 10))
    );
  }

  function openDispute(record) {
    setDisputeOpen(record._id);
    setDisputeForm({ reasonType: "", reasonDetails: "" });
    setDisputeFile(null);
  }

  async function submitDispute(e, record) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("courseId", record.courseId);
      fd.append("attendanceRecordId", record._id);
      fd.append("date", new Date(record.date).toISOString().slice(0, 10));
      fd.append("reasonType", disputeForm.reasonType);
      fd.append("reasonDetails", disputeForm.reasonDetails);
      if (disputeFile) fd.append("doc", disputeFile);
      await api.post("/attendance/od-request", fd, { headers: { "Content-Type": "multipart/form-data" } });
      showToast("Dispute submitted. Faculty will review it.", "success");
      setDisputeOpen(null);
      setDisputeFile(null);
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to submit dispute.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOd(e) {
    e.preventDefault();
    setOdSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("courseId", odForm.courseId);
      fd.append("date", odForm.date);
      fd.append("reasonType", odForm.reasonType);
      fd.append("reasonDetails", odForm.reasonDetails);
      if (odFile) fd.append("doc", odFile);
      await api.post("/attendance/od-request", fd, { headers: { "Content-Type": "multipart/form-data" } });
      showToast("OD request submitted successfully.", "success");
      setShowOdForm(false);
      setOdForm({ courseId: "", date: "", reasonType: "", reasonDetails: "" });
      setOdFile(null);
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to submit OD request.", "error");
    } finally {
      setOdSubmitting(false);
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
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-28 bg-white border border-border rounded-card animate-pulse" />)}
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

          <div className="space-y-4">
              {summary?.subjects?.map((s) => {
                const absents = getDisputeableAbsents(s.courseId);
                const isExpanded = expandedCourse === s.courseId;
                return (
                  <Card key={s.courseId} className="p-0 overflow-hidden">
                    {/* Subject row */}
                    <div className="flex items-center gap-4 p-5">
                      <AttendanceRing percentage={s.percentage} size={68} stroke={6} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-text-primary truncate">{s.courseName}</p>
                        <p className="text-xs text-text-muted mt-0.5">{s.attended} / {s.total} classes</p>
                        {s.percentage < 75 && (
                          <p className="text-xs text-danger font-medium mt-1">⚠ Below 75%</p>
                        )}
                      </div>
                      {absents.length > 0 && (
                        <button
                          onClick={() => setExpandedCourse(isExpanded ? null : s.courseId)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-danger bg-danger/10 hover:bg-danger/20 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                        >
                          <AlertTriangle size={12} />
                          {absents.length} absent{absents.length > 1 ? "s" : ""}
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                    </div>

                    {/* Absent records — expandable */}
                    {isExpanded && absents.length > 0 && (
                      <div className="border-t border-border bg-paper px-5 py-4 space-y-3">
                        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                          Absent Records — Raise a Dispute
                        </p>
                        {absents.map((rec) => {
                          const dateStr = new Date(rec.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                          const isOpen = disputeOpen === rec._id;
                          return (
                            <div key={rec._id} className="border border-border rounded-xl overflow-hidden bg-card">
                              {/* Record header */}
                              <div className="flex items-center justify-between px-4 py-3">
                                <div>
                                  <p className="text-sm font-medium text-text-primary">{dateStr}</p>
                                  <p className="text-xs text-text-muted">{rec.sessionTime} · Marked absent</p>
                                </div>
                                {!isOpen ? (
                                  <button
                                    onClick={() => openDispute(rec)}
                                    className="text-xs font-semibold text-signal hover:underline"
                                  >
                                    Raise Dispute →
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setDisputeOpen(null)}
                                    className="text-xs text-text-muted hover:text-text-primary"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>

                              {/* Dispute form */}
                              {isOpen && (
                                <form
                                  onSubmit={(e) => submitDispute(e, rec)}
                                  className="border-t border-border px-4 py-4 space-y-3 bg-paper"
                                >
                                  <p className="text-xs text-text-secondary">
                                    If you were present or had a valid reason, fill in the details below. The faculty will review your request.
                                  </p>
                                  <div>
                                    <label className="label">Reason *</label>
                                    <select
                                      required
                                      value={disputeForm.reasonType}
                                      onChange={(e) => setDisputeForm((p) => ({ ...p, reasonType: e.target.value }))}
                                      className="input"
                                    >
                                      <option value="">Select reason</option>
                                      {REASON_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="label">Details <span className="text-text-muted font-normal">(optional)</span></label>
                                    <textarea
                                      value={disputeForm.reasonDetails}
                                      onChange={(e) => setDisputeForm((p) => ({ ...p, reasonDetails: e.target.value }))}
                                      maxLength={300}
                                      rows={2}
                                      className="input resize-none"
                                      placeholder="Briefly explain…"
                                    />
                                  </div>
                                  <div>
                                    <label className="label">Supporting Document <span className="text-text-muted font-normal">(optional)</span></label>
                                    <input
                                      ref={disputeFileRef}
                                      type="file"
                                      accept=".pdf,.jpg,.jpeg,.png"
                                      className="hidden"
                                      onChange={(e) => setDisputeFile(e.target.files?.[0] || null)}
                                    />
                                    {disputeFile ? (
                                      <div className="flex items-center gap-2 text-xs text-text-primary bg-paper border border-border rounded-lg px-3 py-2">
                                        <FileText size={13} className="text-signal shrink-0" />
                                        <span className="flex-1 truncate">{disputeFile.name}</span>
                                        <button type="button" onClick={() => setDisputeFile(null)} className="text-danger hover:text-danger/80">
                                          <X size={13} />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => disputeFileRef.current?.click()}
                                        className="flex items-center gap-2 text-xs text-signal border border-dashed border-signal/40 rounded-lg px-3 py-2 hover:bg-signal/5 transition-colors"
                                      >
                                        <Upload size={13} /> Attach proof (PDF / JPG / PNG · max 2 MB)
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <Button type="submit" disabled={submitting} size="sm" className="flex-1">
                                      {submitting ? "Submitting…" : "Submit Dispute"}
                                    </Button>
                                    <Button type="button" variant="secondary" size="sm" onClick={() => setDisputeOpen(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </form>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

        </>
      )}

      {/* Manual OD Request modal */}
      {showOdForm && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-40 p-4">
          <Card className="w-full max-w-md shadow-lift max-h-[90vh] overflow-y-auto">
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
              <div>
                <label className="label">Supporting Document <span className="text-text-muted font-normal">(optional)</span></label>
                <input ref={odFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setOdFile(e.target.files?.[0] || null)} />
                {odFile ? (
                  <div className="flex items-center gap-2 text-xs text-text-primary bg-paper border border-border rounded-lg px-3 py-2">
                    <FileText size={13} className="text-signal shrink-0" />
                    <span className="flex-1 truncate">{odFile.name}</span>
                    <button type="button" onClick={() => setOdFile(null)} className="text-danger"><X size={13} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => odFileRef.current?.click()} className="flex items-center gap-2 text-xs text-signal border border-dashed border-signal/40 rounded-lg px-3 py-2 hover:bg-signal/5 transition-colors">
                    <Upload size={13} /> Attach proof (PDF / JPG / PNG · max 2 MB)
                  </button>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={odSubmitting} className="flex-1">{odSubmitting ? "Submitting…" : "Submit Request"}</Button>
                <Button type="button" variant="secondary" onClick={() => { setShowOdForm(false); setOdFile(null); }}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function OdCard({ r, apiBase }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="p-4">
      <button className="w-full text-left" onClick={() => setExpanded((p) => !p)}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-text-primary text-sm font-mono">{r.courseId}</p>
            <p className="text-xs text-text-muted mt-0.5">{new Date(r.date).toDateString()} · {r.reasonType}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge status={r.status} />
            {expanded ? <ChevronUp size={15} className="text-text-muted" /> : <ChevronDown size={15} className="text-text-muted" />}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          {r.reasonDetails && <p className="text-sm text-text-secondary">{r.reasonDetails}</p>}
          {r.supportingDocPath && (
            <a
              href={`${apiBase}/${r.supportingDocPath}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-signal hover:underline"
            >
              <FileText size={13} /> View attached document <ExternalLink size={11} />
            </a>
          )}
          {r.facultyNote && (
            <div className="bg-paper rounded-card px-3 py-2">
              <p className="text-xs font-semibold text-text-muted mb-0.5">Faculty Note</p>
              <p className="text-sm text-text-secondary">{r.facultyNote}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
