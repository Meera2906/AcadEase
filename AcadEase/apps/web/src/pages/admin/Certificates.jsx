import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

export default function AdminCertificates() {
  const [requests, setRequests]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [rejectReasons, setRejectReasons] = useState({});
  const [processing, setProcessing]   = useState(null);
  const { toast, showToast, clearToast } = useToast();
  const navigate = useNavigate();

  async function load() {
    const res = await api.get("/certificates/requests");
    setRequests(res.data.requests);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function approve(id) {
    setProcessing(id + "approve");
    try {
      await api.patch(`/certificates/request/${id}/approve`);
      showToast("Certificate approved and PDF generated.", "success");
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Approval failed.", "error");
    } finally {
      setProcessing(null);
    }
  }

  async function reject(id) {
    setProcessing(id + "reject");
    try {
      await api.patch(`/certificates/request/${id}/reject`, { reason: rejectReasons[id] || "" });
      showToast("Request rejected.", "success");
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Rejection failed.", "error");
    } finally {
      setProcessing(null);
    }
  }

  const pending   = requests.filter((r) => r.status === "pending");
  const processed = requests.filter((r) => r.status !== "pending");

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Certificate Requests</h1>
      <p className="text-sm text-text-secondary mb-6">
        {pending.length} pending · {processed.length} processed
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display text-base font-semibold text-text-primary mb-3">Pending Approval</h2>
              <div className="space-y-4">
                {pending.map((r) => (
                  <Card key={r._id} className="p-5 border-l-4 border-l-warning">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="font-semibold text-text-primary capitalize">{r.type} Certificate</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <button
                            onClick={() => navigate(`/profile/${r.studentId}`)}
                            className="text-xs text-signal hover:underline font-medium font-mono"
                          >
                            {r.studentId}
                          </button>
                          <span className="text-text-muted text-xs">·</span>
                          <span className="text-xs text-text-muted">{r.purpose}</span>
                          <span className="text-text-muted text-xs">·</span>
                          <span className="text-xs text-text-muted">{new Date(r.createdAt).toDateString()}</span>
                        </div>
                        {r.notes && <p className="text-xs text-text-secondary mt-1.5 italic">"{r.notes}"</p>}
                      </div>
                      <Badge status="pending" />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Button size="sm" onClick={() => approve(r._id)} disabled={!!processing} className="flex items-center gap-1.5">
                        <CheckCircle size={14} />
                        {processing === r._id + "approve" ? "Generating PDF…" : "Approve & Generate PDF"}
                      </Button>
                      <input
                        placeholder="Rejection reason (optional)"
                        value={rejectReasons[r._id] || ""}
                        onChange={(e) => setRejectReasons((prev) => ({ ...prev, [r._id]: e.target.value }))}
                        className="input flex-1 min-w-[160px]"
                      />
                      <Button variant="destructive" size="sm" onClick={() => reject(r._id)} disabled={!!processing} className="flex items-center gap-1.5">
                        <XCircle size={14} />
                        {processing === r._id + "reject" ? "Rejecting…" : "Reject"}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {processed.length > 0 && (
            <div>
              <h2 className="font-display text-base font-semibold text-text-primary mb-3">Processed</h2>
              <div className="space-y-3">
                {processed.map((r) => (
                  <Card key={r._id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-text-primary capitalize">{r.type} Certificate</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <button
                            onClick={() => navigate(`/profile/${r.studentId}`)}
                            className="text-xs text-signal hover:underline font-medium font-mono"
                          >
                            {r.studentId}
                          </button>
                          <span className="text-text-muted text-xs">·</span>
                          <span className="text-xs text-text-muted">{r.purpose}</span>
                        </div>
                        {r.rejectionReason && <p className="text-xs text-danger mt-1">Reason: {r.rejectionReason}</p>}
                      </div>
                      <Badge status={r.status} />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {requests.length === 0 && (
            <p className="text-text-muted text-sm text-center py-12">No certificate requests yet.</p>
          )}
        </>
      )}
    </AppShell>
  );
}
