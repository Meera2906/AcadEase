import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, FileText, ExternalLink } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api$/, "");

export default function FacultyOdRequests() {
  const [requests, setRequests]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [notes, setNotes]           = useState({});
  const [processing, setProcessing] = useState(null);
  const { toast, showToast, clearToast } = useToast();
  const navigate = useNavigate();

  async function load() {
    const res = await api.get("/attendance/od-requests");
    setRequests(res.data.requests);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function review(id, decision) {
    setProcessing(id + decision);
    try {
      await api.patch(`/attendance/od-request/${id}`, { decision, facultyNote: notes[id] || "" });
      showToast(`OD request ${decision}.`, "success");
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Action failed.", "error");
    } finally {
      setProcessing(null);
    }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">OD Requests</h1>
      <p className="text-sm text-text-secondary mb-6">
        {requests.length} pending request{requests.length !== 1 ? "s" : ""} for your courses.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-28 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-full bg-[#E9FCE0] flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={24} className="text-success" />
          </div>
          <p className="text-text-muted text-sm">No pending OD requests.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <Card key={r._id} className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <button
                    onClick={() => navigate(`/profile/${r.studentId}`)}
                    className="font-semibold text-signal hover:underline text-sm font-mono"
                  >
                    {r.studentId}
                  </button>
                  <p className="text-xs text-text-muted mt-0.5">
                    {r.courseId} · {new Date(r.date).toDateString()} · {r.reasonType}
                  </p>
                  {r.reasonDetails && (
                    <p className="text-sm text-text-secondary mt-1.5">{r.reasonDetails}</p>
                  )}
                  {r.supportingDocPath && (
                    <a
                      href={`${apiBase}/${r.supportingDocPath}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-signal hover:underline mt-1.5"
                    >
                      <FileText size={13} /> View attached proof <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                <Badge status={r.status} />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <input
                  placeholder="Note to student (optional)"
                  value={notes[r._id] || ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [r._id]: e.target.value }))}
                  className="input flex-1 min-w-[160px]"
                />
                <Button
                  size="sm"
                  onClick={() => review(r._id, "approved")}
                  disabled={!!processing}
                  className="flex items-center gap-1.5"
                >
                  <CheckCircle size={14} />
                  {processing === r._id + "approved" ? "Approving…" : "Approve"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => review(r._id, "rejected")}
                  disabled={!!processing}
                  className="flex items-center gap-1.5"
                >
                  <XCircle size={14} />
                  {processing === r._id + "rejected" ? "Rejecting…" : "Reject"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
