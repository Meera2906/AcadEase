import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const CATEGORIES   = ["Academic", "Administrative", "Infrastructure", "Other"];
const STATUS_STEPS = ["Open", "In Review", "Resolved"];

export default function StudentGrievances() {
  const { user } = useAuth();
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ category: "", subject: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  async function load() {
    const res = await api.get(`/grievances/student/${user.userId}`);
    setGrievances(res.data.grievances);
  }

  useEffect(() => {
    if (!user) return;
    load().finally(() => setLoading(false));
  }, [user]);

  async function submitGrievance(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/grievances", form);
      showToast("Grievance submitted successfully.", "success");
      setShowForm(false);
      setForm({ category: "", subject: "", description: "" });
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to submit grievance.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRating(id, rating) {
    try {
      await api.post(`/grievances/${id}/rating`, { rating });
      showToast("Rating submitted.", "success");
      await load();
    } catch {
      showToast("Failed to submit rating.", "error");
    }
  }

  function stepIndex(status) {
    const s = status?.toLowerCase();
    if (s === "resolved")  return 2;
    if (s === "in review") return 1;
    return 0;
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Grievances</h1>
          <p className="text-sm text-text-secondary mt-0.5">Submit and track your grievances.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
          <Plus size={15} /> New Grievance
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-20 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : grievances.length === 0 ? (
        <p className="text-text-muted text-sm py-12 text-center">No grievances submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {grievances.map((g) => (
            <Card key={g._id} className="p-4">
              <button className="w-full text-left" onClick={() => setExpanded(expanded === g._id ? null : g._id)}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-text-primary text-sm">{g.subject}</p>
                    <p className="text-xs text-text-muted mt-0.5">{g.category} · {new Date(g.createdAt).toDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge status={g.status?.toLowerCase()} />
                    {expanded === g._id ? <ChevronUp size={15} className="text-text-muted" /> : <ChevronDown size={15} className="text-text-muted" />}
                  </div>
                </div>
              </button>

              {expanded === g._id && (
                <div className="mt-4 pt-4 border-t border-border space-y-4">
                  <p className="text-sm text-text-secondary leading-relaxed">{g.description}</p>

                  {g.status !== "Rejected" && (
                    <div className="flex items-center gap-1">
                      {STATUS_STEPS.map((step, i) => {
                        const current = stepIndex(g.status);
                        const done    = i <= current;
                        return (
                          <div key={step} className="flex items-center gap-1">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${done ? "bg-signal text-white" : "bg-[#EFEBDF] text-text-muted"}`}>
                              {i + 1}
                            </div>
                            <span className={`text-xs font-medium ${done ? "text-signal" : "text-text-muted"}`}>{step}</span>
                            {i < STATUS_STEPS.length - 1 && (
                              <div className={`h-px w-6 mx-1 ${done && i < current ? "bg-signal" : "bg-[#EFEBDF]"}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {g.status === "Rejected" && g.rejectionReason && (
                    <div className="bg-[#FFE7E9] rounded-card px-3 py-2.5">
                      <p className="text-xs font-semibold text-danger mb-1">Rejected</p>
                      <p className="text-sm text-text-secondary">{g.rejectionReason}</p>
                    </div>
                  )}

                  {g.resolutionNote && (
                    <div className="bg-[#E9FCE0] rounded-card px-3 py-2.5">
                      <p className="text-xs font-semibold text-success mb-1">Resolution</p>
                      <p className="text-sm text-text-secondary">{g.resolutionNote}</p>
                    </div>
                  )}

                  {g.status === "Resolved" && !g.satisfactionRating && (
                    <div>
                      <p className="text-xs text-text-muted mb-2 font-medium">Rate your experience</p>
                      <div className="flex gap-2">
                        {[1,2,3,4,5].map((n) => (
                          <button
                            key={n}
                            onClick={() => submitRating(g._id, n)}
                            className="w-9 h-9 rounded-pill border border-border text-sm font-medium hover:bg-[#FFF3DC] hover:border-warning hover:text-warning transition-colors"
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {g.satisfactionRating && (
                    <p className="text-xs text-text-muted">
                      Your rating: <span className="text-warning">{"★".repeat(g.satisfactionRating)}</span>{"☆".repeat(5 - g.satisfactionRating)}
                    </p>
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
            <h2 className="font-display text-lg font-bold text-text-primary mb-4">Submit a Grievance</h2>
            <form onSubmit={submitGrievance} className="space-y-4">
              <div>
                <label className="label">Category</label>
                <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Subject</label>
                <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea required maxLength={500} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
                <p className="text-xs text-text-muted mt-1 text-right">{form.description.length}/500</p>
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
