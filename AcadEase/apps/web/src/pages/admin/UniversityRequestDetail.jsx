import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Paperclip, Send, CheckCircle2, XCircle, MessageSquare,
  Lock, ShieldCheck, Download, HelpCircle,
} from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const STATUS_BADGE = {
  draft: "open", submitted: "pending", under_review: "in review",
  clarification_requested: "late", approved: "approved", rejected: "rejected",
};

export default function UniversityRequestDetail() {
  const { requestId } = useParams();
  const { user } = useAuth();
  const isTnteu = user?.role === "tnteu_admin";
  const { toast, showToast, clearToast } = useToast();
  const fileInput = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [action, setAction] = useState(null); // "approve" | "reject" | "clarify"

  const load = useCallback(async () => {
    try {
      const { data: body } = await api.get(`/university-requests/${requestId}`);
      setData(body);
    } catch (err) {
      showToast(err.response?.data?.error || "Request not found.", "error");
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { load(); }, [load]);

  async function attach(file) {
    setBusy("attach");
    const form = new FormData();
    form.append("file", file);
    form.append("label", file.name);
    try {
      await api.post(`/university-requests/${requestId}/attachments`, form);
      showToast("Attached and encrypted.", "success");
      await load();
    } catch (err) {
      const body = err.response?.data;
      showToast([body?.error, ...(body?.problems || [])].filter(Boolean).join(" "), "error");
    } finally {
      setBusy(null);
    }
  }

  async function openAttachment(attachment) {
    try {
      const res = await api.get(`/university-requests/${requestId}/attachments/${attachment._id}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      showToast(err.response?.data?.error || "Could not open the attachment.", "error");
    }
  }

  async function submitRequest() {
    setBusy("submit");
    try {
      await api.post(`/university-requests/${requestId}/submit`);
      showToast("Submitted to TNTEU.", "success");
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Could not submit.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function sendMessage() {
    if (message.trim().length < 2) return;
    setBusy("message");
    try {
      await api.post(`/university-requests/${requestId}/messages`, { body: message.trim() });
      setMessage("");
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Could not send.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function decide(kind) {
    setBusy(kind);
    const path = kind === "approve" ? "approve" : kind === "reject" ? "reject" : "clarify";
    try {
      const { data: body } = await api.patch(`/university-requests/${requestId}/${path}`, { note: note.trim() });
      showToast(
        body.order
          ? `Signed and ${body.order.decision} — order ${body.order.requestId}.`
          : "Clarification requested.",
        "success"
      );
      setAction(null);
      setNote("");
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Could not record the decision.", "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <AppShell><div className="h-64 bg-white border border-border rounded-card animate-pulse" /></AppShell>;
  }
  if (!data) {
    return <AppShell><Card className="text-center py-12"><p className="text-sm text-text-secondary">Request not found.</p></Card></AppShell>;
  }

  const { request, college, signatureChain } = data;
  const editable = ["draft", "clarification_requested"].includes(request.status);
  const decidable = isTnteu && ["submitted", "under_review", "clarification_requested"].includes(request.status);

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <Link to="/admin/university-requests" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-signal mb-4">
        <ArrowLeft size={15} /> Back to requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">{request.title}</h1>
          <p className="text-sm text-text-secondary">
            <span className="font-mono">{request.requestId}</span> · {request.typeLabel} · {college?.name || request.collegeId}
            {request.academicYear ? ` · ${request.academicYear}` : ""}
          </p>
        </div>
        <Badge status={STATUS_BADGE[request.status] || request.status}>{request.status.replace(/_/g, " ")}</Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="font-display text-lg font-bold text-text-primary mb-3">What is being asked</h2>
            <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{request.description}</p>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold text-text-primary">Supporting documents</h2>
              {editable && (
                <>
                  <input
                    ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ""; }}
                  />
                  <Button size="sm" variant="secondary" disabled={busy === "attach"} onClick={() => fileInput.current?.click()}>
                    <Paperclip size={13} className="mr-1" /> {busy === "attach" ? "Uploading…" : "Attach"}
                  </Button>
                </>
              )}
            </div>

            {request.requiredDocuments?.length > 0 && (
              <p className="text-[11px] text-text-muted mb-3">
                TNTEU normally expects: {request.requiredDocuments.join(", ")}
              </p>
            )}

            {request.attachments.length === 0 ? (
              <p className="text-sm text-text-muted">Nothing attached yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {request.attachments.map((attachment) => (
                  <div key={attachment._id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{attachment.label}</p>
                      <p className="text-[11px] text-text-muted flex items-center gap-1">
                        <Lock size={9} /> {(attachment.size / 1024).toFixed(0)} KB · readable by {attachment.readableBy?.join(" and ")}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openAttachment(attachment)}>
                      <Download size={13} className="mr-1" /> Open
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {editable && (
              <div className="mt-4 pt-4 border-t border-border">
                <Button disabled={busy === "submit"} onClick={submitRequest}>
                  <Send size={14} className="mr-1.5" /> {busy === "submit" ? "Submitting…" : "Submit to TNTEU"}
                </Button>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
              <MessageSquare size={16} /> Correspondence
            </h2>
            {request.messages.length === 0 ? (
              <p className="text-sm text-text-muted mb-3">No messages yet.</p>
            ) : (
              <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
                {request.messages.map((m) => (
                  <div key={m._id} className={`p-3 rounded-card ${m.authorRole === "tnteu_admin" ? "bg-[#E8ECFF]" : "bg-paper"}`}>
                    <p className="text-[11px] font-semibold text-text-secondary mb-1">
                      {m.authorName} · {m.authorRole === "tnteu_admin" ? "TNTEU" : "University"} · {new Date(m.sentAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Write a message…"
                className="flex-1 px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-signal/30"
              />
              <Button size="sm" disabled={busy === "message"} onClick={sendMessage}>Send</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {/* TNTEU decision panel */}
          {decidable && (
            <Card className="!p-4">
              <h2 className="font-display text-sm font-bold text-text-primary mb-3">TNTEU decision</h2>
              <p className="text-[11px] text-text-muted mb-3 leading-relaxed">
                Your decision is signed with TNTEU's private key. The college can show the signed order to anyone,
                and it can be verified without contacting you.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="success" onClick={() => setAction(action === "approve" ? null : "approve")}>
                  <CheckCircle2 size={13} className="mr-1" /> Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setAction(action === "reject" ? null : "reject")}>
                  <XCircle size={13} className="mr-1" /> Reject
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAction(action === "clarify" ? null : "clarify")}>
                  <HelpCircle size={13} className="mr-1" /> Ask for more
                </Button>
              </div>

              {action && (
                <div className="mt-3">
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      action === "approve" ? "Optional note on the approval order…"
                      : action === "reject" ? "Why is this being rejected? (required)"
                      : "What clarification is needed? (required)"
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-signal/30"
                  />
                  <Button size="sm" className="mt-2" disabled={Boolean(busy)} onClick={() => decide(action)}>
                    {busy ? "Signing…" : `Confirm ${action}`}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Signed decision */}
          {signatureChain?.links?.length > 0 && (
            <Card className={`!p-4 ${signatureChain.valid ? "border-success/40" : "border-danger/40"}`}>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={15} className={signatureChain.valid ? "text-success" : "text-danger"} />
                <h2 className="font-display text-sm font-bold text-text-primary">Signed decision</h2>
              </div>
              {signatureChain.links.map((link, index) => (
                <div key={index} className="text-[11px] mb-2 pb-2 border-b border-border last:border-0">
                  <p className="font-semibold text-text-primary capitalize">
                    {link.decision} by {link.authority}
                  </p>
                  <p className="text-text-muted">{link.actorName} · {new Date(link.decidedAt).toLocaleString()}</p>
                  {link.remarks && <p className="text-text-secondary mt-0.5">{link.remarks}</p>}
                  <p className="text-text-muted font-mono mt-1 break-all">
                    {link.algorithm} · key {String(link.keyFingerprint || "").slice(0, 16)}
                  </p>
                  <p className={link.valid ? "text-success font-semibold mt-0.5" : "text-danger font-semibold mt-0.5"}>
                    {link.valid ? "Signature verified" : link.reason}
                  </p>
                </div>
              ))}
            </Card>
          )}

          <Card className="!p-4">
            <h2 className="font-display text-sm font-bold text-text-primary mb-3">Details</h2>
            <dl className="space-y-2 text-xs">
              {[
                ["University", college?.name],
                ["District", college?.district],
                ["Sanctioned B.Ed seats", college?.bedSeats],
                ["Sanctioned M.Ed seats", college?.medSeats],
                ["Submitted", request.submittedAt && new Date(request.submittedAt).toLocaleDateString()],
                ["Decided", request.reviewedAt && new Date(request.reviewedAt).toLocaleDateString()],
              ]
                .filter(([, v]) => v !== undefined && v !== null && v !== "")
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="text-text-primary font-medium text-right">{value}</dd>
                  </div>
                ))}
            </dl>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
