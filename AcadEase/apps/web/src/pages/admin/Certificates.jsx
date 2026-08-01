import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, ShieldCheck, ArrowUpRight, Clock } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

// Where a request sits in the two-institution chain, in the words each role
// needs to see.
const STAGE_COPY = {
  college_review: { label: "Awaiting university approval", tone: "text-warning" },
  tnteu_review:   { label: "Awaiting TNTEU counter-signature", tone: "text-signal" },
  issued:         { label: "Issued", tone: "text-success" },
  rejected:       { label: "Rejected", tone: "text-danger" },
};

function ChainTrail({ approvals = [] }) {
  if (!approvals.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border space-y-1">
      {approvals.map((a, i) => (
        <p key={i} className="text-[11px] text-text-muted flex items-center gap-1.5">
          <ShieldCheck size={10} className={a.decision === "approved" ? "text-success" : "text-danger"} />
          <span className="capitalize">{a.decision}</span> by{" "}
          <span className="font-medium text-text-secondary">
            {a.keyId === "tnteu" ? "TNTEU" : a.keyId}
          </span>
          {" · "}{a.actorName || a.actorId}
          {" · "}{new Date(a.decidedAt).toLocaleDateString()}
          <span className="font-mono">· {String(a.keyFingerprint || "").slice(0, 10)}</span>
        </p>
      ))}
    </div>
  );
}

export default function AdminCertificates() {
  const [requests, setRequests]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [rejectReasons, setRejectReasons] = useState({});
  const [processing, setProcessing]   = useState(null);
  const [revoking, setRevoking]       = useState(null);
  const { toast, showToast, clearToast } = useToast();
  const { user } = useAuth();
  const isTnteu = user?.role === "tnteu_admin";
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

  async function revoke(certId, id) {
    setRevoking(id);
    try {
      await api.patch(`/certificates/${certId}/revoke`, { reason: rejectReasons[id] || "" });
      showToast("Certificate revoked.", "success");
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Revocation failed.", "error");
    } finally {
      setRevoking(null);
    }
  }

  // Only what this institution can actually act on right now.
  const pending   = requests.filter((r) => r.actionable);
  const waiting   = requests.filter((r) => !r.actionable && r.status === "pending");
  const processed = requests.filter((r) => r.status !== "pending");

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Certificate Requests</h1>
      <p className="text-sm text-text-secondary mb-6">
        {pending.length} awaiting your {isTnteu ? "counter-signature" : "approval"} · {waiting.length} with the other authority · {processed.length} closed
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display text-base font-semibold text-text-primary mb-1">
                {isTnteu ? "Awaiting your counter-signature" : "Awaiting your approval"}
              </h2>
              <p className="text-xs text-text-secondary mb-3">
                {isTnteu
                  ? "Already approved by the student's university. Your signature issues the certificate."
                  : "Your approval forwards the request to TNTEU for final counter-signature."}
              </p>
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
                        <ChainTrail approvals={r.approvals} />
                      </div>
                      <Badge status="pending" />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Button size="sm" onClick={() => approve(r._id)} disabled={!!processing} className="flex items-center gap-1.5">
                        <CheckCircle size={14} />
                        {processing === r._id + "approve"
                          ? (isTnteu ? "Signing & generating…" : "Signing…")
                          : (isTnteu ? "Counter-sign & issue" : "Approve & send to TNTEU")}
                      </Button>
                      <input
                        placeholder="Rejection reason (required)"
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

          {waiting.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display text-base font-semibold text-text-primary mb-3">
                With the other authority
              </h2>
              <div className="space-y-2">
                {waiting.map((r) => (
                  <Card key={r._id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-text-primary capitalize">{r.type} Certificate</p>
                        <p className="text-xs text-text-muted font-mono">{r.studentId}</p>
                        <ChainTrail approvals={r.approvals} />
                      </div>
                      <span className={`text-xs font-semibold flex items-center gap-1 shrink-0 ${STAGE_COPY[r.stage]?.tone || ""}`}>
                        <Clock size={12} /> {STAGE_COPY[r.stage]?.label || r.stage}
                      </span>
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
                        {r.rejectionReason && (
                          <p className="text-xs text-danger mt-1">
                            Rejected at {r.rejectedStage === "tnteu_review" ? "TNTEU" : "university"} stage: {r.rejectionReason}
                          </p>
                        )}
                        <ChainTrail approvals={r.approvals} />
                      </div>
                      <div className="flex items-center gap-2">
                        {r.certificateCertId && r.certificateStatus !== "revoked" && (
                          <div className="flex items-center gap-2">
                            <input
                              placeholder="Revocation reason"
                              value={rejectReasons[r._id] || ""}
                              onChange={(e) => setRejectReasons((prev) => ({ ...prev, [r._id]: e.target.value }))}
                              className="input min-w-[150px]"
                            />
                            <Button variant="destructive" size="sm" onClick={() => revoke(r.certificateCertId, r._id)} disabled={!!revoking}>
                              {revoking === r._id ? "Revoking…" : "Revoke"}
                            </Button>
                          </div>
                        )}
                        <Badge status={r.certificateStatus === "revoked" ? "revoked" : r.status} />
                      </div>
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
