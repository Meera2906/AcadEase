import { useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const CERT_TYPES = ["bonafide", "completion", "attendance", "character", "merit"];
const PURPOSES   = ["Bank Account", "Visa Application", "Scholarship", "Job Application", "Other"];

const TYPE_COLORS = {
  bonafide:   "bg-[#E8ECFF] text-signal",
  completion: "bg-[#E9FCE0] text-success",
  attendance: "bg-[#E6FAF8] text-teal",
  character:  "bg-[#FFF3DC] text-warning",
  merit:      "bg-[#FFF3DC] text-warning",
};

export default function StudentCertificates() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ type: "", purpose: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  async function load() {
    const res = await api.get(`/certificates/requests/student/${user.userId}`);
    setRequests(res.data.requests);
  }

  useEffect(() => {
    if (!user) return;
    load().finally(() => setLoading(false));
  }, [user]);

  async function submitRequest(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/certificates/request", form);
      showToast("Certificate request submitted.", "success");
      setShowForm(false);
      setForm({ type: "", purpose: "", notes: "" });
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to submit request.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload(certId) {
    try {
      const res = await api.get(`/certificates/download/${certId}`);
      const base = import.meta.env.VITE_API_BASE_URL?.replace("/api", "") || "http://localhost:5000";
      const pdfPath = res.data.pdfPath;
      if (!pdfPath) { showToast("PDF not available yet.", "error"); return; }
      // pdfPath is like "storage/certificates/xxx.pdf" — serve via static route
      window.open(`${base}/${pdfPath}`, "_blank");
    } catch {
      showToast("Failed to get download link.", "error");
    }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Certificates</h1>
          <p className="text-sm text-text-secondary mt-0.5">Request and download your certificates.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
          <Plus size={15} /> Request
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-20 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted text-sm">No certificate requests yet.</p>
          <Button onClick={() => setShowForm(true)} variant="secondary" className="mt-4">
            Request your first certificate
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r._id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className={`px-3 py-1 rounded-pill text-xs font-semibold capitalize ${TYPE_COLORS[r.type] || "bg-[#F1EFE6] text-text-secondary"}`}>
                    {r.type}
                  </span>
                  <div>
                    <p className="font-medium text-text-primary text-sm">{r.purpose}</p>
                    <p className="text-xs text-text-muted mt-0.5">{new Date(r.createdAt).toDateString()}</p>
                    {r.rejectionReason && (
                      <p className="text-xs text-danger mt-1">Rejected: {r.rejectionReason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge status={r.status} />
                  {r.status === "approved" && r.certId && (
                    <button
                      onClick={() => handleDownload(r.certId)}
                      className="w-8 h-8 rounded-pill bg-[#E8ECFF] text-signal flex items-center justify-center hover:bg-signal hover:text-white transition-colors"
                      title="Download PDF"
                    >
                      <Download size={14} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-40 p-4">
          <Card className="w-full max-w-md shadow-lift">
            <h2 className="font-display text-lg font-bold text-text-primary mb-4">Request a Certificate</h2>
            <form onSubmit={submitRequest} className="space-y-4">
              <div>
                <label className="label">Certificate Type</label>
                <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
                  <option value="">Select type</option>
                  {CERT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Purpose</label>
                <select required value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="input">
                  <option value="">Select purpose</option>
                  {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Notes <span className="text-text-muted font-normal">(optional)</span></label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="input" />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={submitting} className="flex-1">{submitting ? "Submitting…" : "Submit Request"}</Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
