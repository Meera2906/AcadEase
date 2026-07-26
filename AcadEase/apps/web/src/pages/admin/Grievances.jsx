import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const STATUS_FILTERS = ["all", "Open", "In Review", "Resolved", "Rejected"];

export default function AdminGrievances() {
  const [grievances, setGrievances] = useState([]);
  const [filter, setFilter]         = useState("all");
  const [loading, setLoading]       = useState(true);
  const [notes, setNotes]           = useState({});
  const [processing, setProcessing] = useState(null);
  const { toast, showToast, clearToast } = useToast();
  const navigate = useNavigate();

  async function load() {
    const params = filter !== "all" ? `?status=${encodeURIComponent(filter)}` : "";
    const res = await api.get(`/grievances${params}`);
    setGrievances(res.data.grievances);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, [filter]);

  async function action(id, endpoint, body = {}) {
    setProcessing(id + endpoint);
    try {
      await api.patch(`/grievances/${id}/${endpoint}`, body);
      showToast("Updated successfully.", "success");
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

      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Grievances</h1>
      <p className="text-sm text-text-secondary mb-4">Review and resolve student grievances.</p>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all capitalize ${
              filter === s
                ? "bg-ink text-white shadow-card"
                : "bg-white border border-border text-text-secondary hover:border-ink hover:text-text-primary"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : grievances.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-12">No grievances found.</p>
      ) : (
        <div className="space-y-4">
          {grievances.map((g) => (
            <Card key={g._id} className="p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-text-primary">{g.subject}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <button
                      onClick={() => navigate(`/profile/${g.studentId}`)}
                      className="text-xs text-signal hover:underline font-medium font-mono"
                    >
                      {g.studentId}
                    </button>
                    <span className="text-text-muted text-xs">·</span>
                    <span className="text-xs text-text-muted">{g.category}</span>
                    <span className="text-text-muted text-xs">·</span>
                    <span className="text-xs text-text-muted">{new Date(g.createdAt).toDateString()}</span>
                  </div>
                </div>
                <Badge status={g.status?.toLowerCase()} />
              </div>

              <p className="text-sm text-text-secondary mb-4 leading-relaxed">{g.description}</p>

              {g.status === "Open" && (
                <Button variant="secondary" size="sm" onClick={() => action(g._id, "acknowledge")} disabled={!!processing}>
                  {processing === g._id + "acknowledge" ? "Acknowledging…" : "Acknowledge"}
                </Button>
              )}

              {g.status === "In Review" && (
                <div className="space-y-3">
                  <textarea
                    placeholder="Resolution note"
                    value={notes[g._id] || ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [g._id]: e.target.value }))}
                    rows={2}
                    className="input"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => action(g._id, "resolve", { resolutionNote: notes[g._id] || "" })} disabled={!!processing}>
                      {processing === g._id + "resolve" ? "Resolving…" : "Resolve"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => action(g._id, "reject", { reason: notes[g._id] || "" })} disabled={!!processing}>
                      {processing === g._id + "reject" ? "Rejecting…" : "Reject"}
                    </Button>
                  </div>
                </div>
              )}

              {g.resolutionNote && (
                <div className="mt-3 bg-[#E9FCE0] rounded-card px-3 py-2.5">
                  <p className="text-xs font-semibold text-success mb-1">Resolution</p>
                  <p className="text-sm text-text-secondary">{g.resolutionNote}</p>
                </div>
              )}

              {g.satisfactionRating && (
                <p className="text-xs text-text-muted mt-2">
                  Student rating: <span className="text-warning">{"★".repeat(g.satisfactionRating)}</span>{"☆".repeat(5 - g.satisfactionRating)}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
