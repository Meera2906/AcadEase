import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, Plus, ChevronLeft, ChevronRight, Clock, CheckCircle2,
  XCircle, MessageSquare, Gauge, Inbox,
} from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const STATUS_BADGE = {
  draft: "open",
  submitted: "pending",
  under_review: "in review",
  clarification_requested: "late",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "holiday",
};

const inputClass =
  "w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-2 focus:ring-signal/30";

function NewRequestForm({ types, onCreated, onCancel }) {
  const { toast, showToast, clearToast } = useToast();
  const [form, setForm] = useState({ type: types[0]?.type || "affiliation_renewal", title: "", description: "", academicYear: "", priority: "routine" });
  const [busy, setBusy] = useState(false);
  const selected = types.find((t) => t.type === form.type);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/university-requests", form);
      showToast("Draft created.", "success");
      onCreated(data.request);
    } catch (err) {
      showToast(err.response?.data?.error || "Could not create the request.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <Toast toast={toast} onClose={clearToast} />
      <h2 className="font-display text-lg font-bold text-text-primary mb-4">Raise a request to TNTEU</h2>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-semibold text-text-secondary mb-1">What are you applying for?</span>
            <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} className={inputClass}>
              {types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-text-secondary mb-1">Academic year</span>
            <input value={form.academicYear} onChange={(e) => setForm((p) => ({ ...p, academicYear: e.target.value }))} placeholder="2025-2026" className={inputClass} />
          </label>
        </div>

        {selected && (
          <div className="p-3 bg-paper rounded-card border border-border">
            <p className="text-xs text-text-secondary">{selected.description}</p>
            {selected.requiredDocuments?.length > 0 && (
              <p className="text-[11px] text-text-muted mt-1.5">
                Attach after creating: {selected.requiredDocuments.join(", ")}
              </p>
            )}
          </div>
        )}

        <label className="block">
          <span className="block text-xs font-semibold text-text-secondary mb-1">Title</span>
          <input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className={inputClass} />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-text-secondary mb-1">Details of your request</span>
          <textarea required rows={4} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className={inputClass} />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.priority === "urgent"} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.checked ? "urgent" : "routine" }))} />
          <span className="text-xs text-text-secondary">Mark as urgent</span>
        </label>

        <div className="flex gap-2 pt-2 border-t border-border">
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create draft"}</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

export default function UniversityRequests() {
  const { user } = useAuth();
  const isTnteu = user?.role === "tnteu_admin";
  const { toast, showToast, clearToast } = useToast();

  const [data, setData] = useState({ requests: [], page: 1, totalPages: 1, total: 0 });
  const [stats, setStats] = useState(null);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(isTnteu ? "submitted" : "");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, statsRes] = await Promise.all([
        api.get("/university-requests", { params: { page, limit: 20, status: status || undefined } }),
        api.get("/university-requests/stats"),
      ]);
      setData(list.data);
      setStats(statsRes.data);
    } catch (err) {
      showToast(err.response?.data?.error || "Could not load requests.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/university-requests/types").then((r) => setTypes(r.data.types)).catch(() => {}); }, []);

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-1">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          {isTnteu ? "University Requests" : "Requests to TNTEU"}
        </h1>
        {!isTnteu && (
          <Button size="sm" onClick={() => setCreating((c) => !c)}>
            <Plus size={14} className="mr-1" /> New request
          </Button>
        )}
      </div>
      <p className="text-sm text-text-secondary mb-6 max-w-2xl">
        {isTnteu
          ? "Affiliation renewals, seat revisions, new programmes and staff approvals submitted by affiliated colleges. Every decision is counter-signed with TNTEU's key."
          : "Apply to TNTEU for affiliation renewals, seat matrix changes, new programmes, faculty approval and exam centre designation. Attachments are encrypted; decisions come back digitally signed."}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Inbox} label="Awaiting decision" value={(stats?.status.submitted ?? 0) + (stats?.status.under_review ?? 0)} gradient="bg-ink" />
        <StatCard icon={MessageSquare} label="Needs clarification" value={stats?.status.clarification_requested} gradient="bg-ink-fade" />
        <StatCard icon={CheckCircle2} label="Approved" value={stats?.status.approved} gradient="bg-success" />
        <StatCard
          icon={Gauge}
          label="Avg decision time"
          value={stats?.avgDecisionDays != null ? `${stats.avgDecisionDays}d` : "—"}
          sub={`${stats?.decidedTotal ?? 0} decided`}
          gradient="bg-signal"
        />
      </div>

      {creating && types.length > 0 && (
        <NewRequestForm
          types={types}
          onCancel={() => setCreating(false)}
          onCreated={() => { setCreating(false); setStatus(""); setPage(1); load(); }}
        />
      )}

      <Card className="mb-4 !p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
            className="px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-2 focus:ring-signal/30"
          >
            <option value="">All requests</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="clarification_requested">Clarification requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <span className="text-xs text-text-muted ml-auto">{data.total} total</span>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : data.requests.length === 0 ? (
        <Card className="text-center py-12">
          <Building2 size={26} className="text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No requests here.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.requests.map((request) => (
            <Link
              key={request.requestId}
              to={`/admin/university-requests/${request.requestId}`}
              className={`block p-4 bg-card border rounded-card hover:shadow-lift transition-shadow ${
                request.priority === "urgent" ? "border-l-2 border-l-danger border-border" : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-text-primary">{request.title}</p>
                    {request.priority === "urgent" && (
                      <span className="px-2 py-0.5 rounded-pill bg-[#FFE7E9] text-danger text-[10px] font-bold">URGENT</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    <span className="font-mono">{request.requestId}</span> · {request.typeLabel}
                    {isTnteu ? ` · ${request.collegeName}` : ""}
                    {request.academicYear ? ` · ${request.academicYear}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {request.attachmentCount > 0 && (
                    <span className="text-xs text-text-muted">{request.attachmentCount} file(s)</span>
                  )}
                  {request.messages?.length > 0 && (
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <MessageSquare size={12} /> {request.messages.length}
                    </span>
                  )}
                  <Badge status={STATUS_BADGE[request.status] || request.status}>
                    {request.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-text-muted">Page {data.page} of {data.totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} /> Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
