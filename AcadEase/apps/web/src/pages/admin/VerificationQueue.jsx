import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Clock, FileCheck2,
  Gauge, Building2, Inbox, ShieldCheck, ShieldAlert, Eye, CheckCircle2, XCircle,
} from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

// The three buckets the server's bulk gate sorts every document into. Only
// "clean" can be swept through without a human opening the file.
const SEVERITY = {
  clean: {
    label: "Clean",
    className: "bg-[#E9FCE0] text-success",
    icon: ShieldCheck,
    note: "All automated checks ran and found nothing.",
  },
  attention: {
    label: "Needs a look",
    className: "bg-[#FFF3DC] text-[#8a6300]",
    icon: Eye,
    note: "A check could not complete — open it and decide yourself.",
  },
  suspect: {
    label: "Suspect",
    className: "bg-[#FFE7E9] text-danger",
    icon: ShieldAlert,
    note: "A check positively found something wrong. Reject unless you can explain it.",
  },
};

const STAGE_COPY = {
  college: {
    title: "Verify Your Applicants' Documents",
    blurb:
      "Stage 1 of 2. Approve the documents your university stands behind — they then go to TNTEU for final approval. Anything the automated checks flagged has to be opened individually; it cannot be bulk-approved.",
    approveVerb: "Approve & send to TNTEU",
  },
  tnteu: {
    title: "TNTEU Final Approval",
    blurb:
      "Stage 2 of 2. Every document here has already been approved and counter-signed by the submitting university. Your approval is what marks it verified. Flagged documents must be opened individually.",
    approveVerb: "Give final approval",
  },
};

export default function VerificationQueue() {
  const [queue, setQueue] = useState({ documents: [], page: 1, totalPages: 1, total: 0, summary: {} });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [flagged, setFlagged] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [report, setReport] = useState(null);
  const { toast, showToast, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, flagged: flagged || undefined, collegeId: collegeId || undefined };
      const [queueRes, statsRes] = await Promise.all([
        api.get("/admissions/queue", { params }),
        api.get("/admissions/stats", { params: { collegeId: collegeId || undefined } }),
      ]);
      setQueue(queueRes.data);
      setStats(statsRes.data);
      // A decided document is gone from the queue; keeping it selected would
      // silently re-submit it on the next bulk action.
      setSelected(new Set());
    } catch (err) {
      showToast(err.response?.data?.error || "Could not load the queue.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, flagged, collegeId]);

  useEffect(() => { load(); }, [load]);

  const stage = queue.stage || "tnteu";
  const copy = STAGE_COPY[stage] || STAGE_COPY.tnteu;
  const isTnteu = stage === "tnteu";

  const eligibleOnPage = useMemo(
    () => queue.documents.filter((doc) => doc.bulkEligible),
    [queue.documents]
  );
  const selectedDocs = useMemo(
    () => queue.documents.filter((doc) => selected.has(doc._id)),
    [queue.documents, selected]
  );
  const selectedBlocked = selectedDocs.filter((doc) => !doc.bulkEligible).length;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllEligible() {
    setSelected(new Set(eligibleOnPage.map((doc) => doc._id)));
  }

  async function bulk(decision, body) {
    setBusy(true);
    setReport(null);
    try {
      const res = await api.post("/admissions/queue/bulk", { decision, ...body });
      setReport(res.data);
      showToast(res.data.message, res.data.decidedCount ? "success" : "error");
      setRejectOpen(false);
      setReason("");
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "The bulk action failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  const summary = queue.summary || {};

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">{copy.title}</h1>
      <p className="text-sm text-text-secondary mb-6 max-w-3xl">{copy.blurb}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Inbox}
          label={isTnteu ? "Awaiting your approval" : "Awaiting your review"}
          value={isTnteu ? stats?.documents.awaitingTnteu : stats?.documents.awaitingCollege}
          sub={isTnteu ? `${stats?.documents.awaitingCollege ?? 0} still with universities` : "Stage 1 of 2"}
          gradient="bg-ink"
        />
        <StatCard
          icon={ShieldCheck}
          label="Bulk-approvable"
          value={summary.clean ?? 0}
          sub={`${(summary.attention ?? 0) + (summary.suspect ?? 0)} need opening`}
          gradient="bg-success"
        />
        <StatCard
          icon={Gauge}
          label="Avg time to verify"
          value={stats?.avgTimeToVerifyHours != null ? `${stats.avgTimeToVerifyHours}h` : "—"}
          sub={`${stats?.reviewedTotal ?? 0} reviewed`}
          gradient="bg-signal"
        />
        <StatCard
          icon={Building2}
          label="Applicants verified"
          value={stats?.applicants.verified}
          sub={`${stats?.applicants.under_review ?? 0} in review`}
          gradient="bg-ink-fade"
        />
      </div>

      {/* The outcome of the last bulk action, held on screen. A sweep that
          silently held twelve documents back would be worse than useless. */}
      {report && (
        <Card className="mb-4 !p-4 border-l-2 border-l-signal">
          <p className="text-sm font-semibold text-text-primary mb-1">{report.message}</p>
          {report.applicantsNowVerified?.length > 0 && (
            <p className="text-xs text-success mb-2">
              Fully verified: {report.applicantsNowVerified.map((a) => a.name || a.applicantId).join(", ")}
            </p>
          )}
          {report.skipped?.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-xs font-semibold text-warning">Held back for individual review:</p>
              {report.skipped.map((item) => (
                <p key={item.documentId} className="text-xs text-text-secondary">
                  <Link to={`/admin/verification/${item.documentId}`} className="font-semibold text-signal hover:underline">
                    {item.label} — {item.applicantId}
                  </Link>{" "}
                  · {item.reasons.join("; ")}
                </p>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card className="mb-4 !p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={flagged}
                onChange={(event) => { setPage(1); setFlagged(event.target.value); }}
                className="px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-2 focus:ring-signal/30"
              >
                <option value="">All pending documents</option>
                <option value="true">Flagged only</option>
                <option value="false">Unflagged only</option>
              </select>

              {isTnteu && (
                <input
                  value={collegeId}
                  onChange={(event) => { setPage(1); setCollegeId(event.target.value); }}
                  placeholder="Filter by university ID"
                  className="px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-signal/30 flex-1 min-w-[180px]"
                />
              )}

              <span className="text-xs text-text-muted ml-auto">{queue.total} in queue</span>
            </div>
          </Card>

          {/* Bulk action bar */}
          <Card className="mb-4 !p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" disabled={busy || !eligibleOnPage.length} onClick={selectAllEligible}>
                Select {eligibleOnPage.length} clean on this page
              </Button>
              {selected.size > 0 && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              )}

              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="success"
                  disabled={busy || selected.size === 0}
                  onClick={() => bulk("approve", { documentIds: [...selected] })}
                >
                  <CheckCircle2 size={14} className="mr-1.5" />
                  {copy.approveVerb} ({selected.size})
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy || selected.size === 0}
                  onClick={() => setRejectOpen((open) => !open)}
                >
                  <XCircle size={14} className="mr-1.5" /> Reject ({selected.size})
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !summary.clean}
                  onClick={() => bulk("approve", { scope: "all_eligible" })}
                  title="Approves every clean document at your stage, up to 200 at a time"
                >
                  {copy.approveVerb} — all {summary.clean ?? 0} clean
                </Button>
              </div>
            </div>

            {selectedBlocked > 0 && (
              <p className="text-xs text-warning mt-2 flex items-center gap-1.5">
                <AlertTriangle size={12} />
                {selectedBlocked} of the selected document(s) are flagged. Bulk approval will refuse them and list
                them below — open each one to decide. Bulk rejection still applies to them.
              </p>
            )}

            {rejectOpen && (
              <div className="mt-3 pt-3 border-t border-border">
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Reason for rejecting {selected.size} document(s) — recorded against every one of them, signed, and
                  sent to the university
                </label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  placeholder="e.g. Wrong document uploaded for this slot — resubmit the correct certificate."
                  className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-danger/30"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  className="mt-2"
                  disabled={busy || reason.trim().length < 5}
                  onClick={() => bulk("reject", { documentIds: [...selected], reason: reason.trim() })}
                >
                  Confirm rejection
                </Button>
              </div>
            )}
          </Card>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-white border border-border rounded-card animate-pulse" />)}
            </div>
          ) : queue.documents.length === 0 ? (
            <Card className="text-center py-12">
              <FileCheck2 size={28} className="text-success mx-auto mb-3" />
              <p className="text-sm font-semibold text-text-primary">Queue is clear</p>
              <p className="text-xs text-text-secondary mt-1">
                {isTnteu
                  ? "No university has forwarded anything for final approval."
                  : "None of your applicants' documents are waiting on you."}
              </p>
            </Card>
          ) : (
            <div className="border border-border rounded-card overflow-hidden bg-card">
              <div className="hidden md:grid grid-cols-[auto_1.3fr_1.1fr_1.5fr_auto] gap-4 px-4 py-2.5 bg-paper border-b border-border text-xs font-semibold text-text-secondary">
                <span className="w-4" />
                <span>Applicant</span>
                <span>Document</span>
                <span>Checks</span>
                <span>Waiting</span>
              </div>
              <div className="divide-y divide-border">
                {queue.documents.map((doc) => {
                  const tone = SEVERITY[doc.severity] || SEVERITY.attention;
                  const SeverityIcon = tone.icon;
                  return (
                    <div
                      key={doc._id}
                      className={`grid md:grid-cols-[auto_1.3fr_1.1fr_1.5fr_auto] gap-4 px-4 py-3 items-center ${
                        doc.severity === "suspect"
                          ? "border-l-2 border-l-danger"
                          : doc.severity === "attention"
                            ? "border-l-2 border-l-warning"
                            : ""
                      } ${selected.has(doc._id) ? "bg-[#F2F5FF]" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(doc._id)}
                        onChange={() => toggle(doc._id)}
                        aria-label={`Select ${doc.label} for ${doc.applicantId}`}
                        className="w-4 h-4 accent-[#2F4BFF] cursor-pointer"
                      />

                      <div className="min-w-0">
                        <Link
                          to={`/admin/verification/${doc._id}`}
                          className="text-sm font-semibold text-text-primary hover:text-signal"
                        >
                          {doc.applicantName || doc.applicantId}
                        </Link>
                        <p className="text-xs text-text-muted truncate">{doc.collegeName}</p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm text-text-primary truncate">{doc.label}</p>
                        <p className="text-xs text-text-muted font-mono truncate">{doc.applicantId}</p>
                      </div>

                      <div>
                        <span
                          className={`px-2 py-0.5 rounded-pill text-[11px] font-semibold inline-flex items-center gap-1 ${tone.className}`}
                        >
                          <SeverityIcon size={10} /> {tone.label}
                        </span>
                        {doc.blockers?.length > 0 && (
                          <p className="text-[11px] text-text-secondary mt-1 leading-snug">
                            {doc.blockers.map((item) => item.label).join(" · ")}
                          </p>
                        )}
                        {isTnteu && doc.collegeReview?.by && (
                          <p className="text-[11px] text-text-muted mt-1">
                            Approved by {doc.collegeReview.byName || doc.collegeReview.by}
                            {doc.collegeReview.mode === "bulk" ? " (bulk)" : ""}
                          </p>
                        )}
                      </div>

                      <span className="text-xs text-text-muted flex items-center gap-1 whitespace-nowrap">
                        <Clock size={12} /> {doc.waitingHours}h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {queue.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-text-muted">Page {queue.page} of {queue.totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={14} /> Previous
                </Button>
                <Button size="sm" variant="secondary" disabled={page >= queue.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="!p-4">
            <h2 className="font-display text-sm font-bold text-text-primary mb-3">What can be bulk-approved</h2>
            <div className="space-y-2.5">
              {["clean", "attention", "suspect"].map((key) => {
                const tone = SEVERITY[key];
                const Icon = tone.icon;
                return (
                  <div key={key} className="flex items-start gap-2">
                    <Icon size={13} className={`mt-0.5 shrink-0 ${key === "clean" ? "text-success" : key === "suspect" ? "text-danger" : "text-warning"}`} />
                    <div>
                      <p className="text-xs font-semibold text-text-primary">
                        {tone.label} · {summary[key] ?? 0}
                      </p>
                      <p className="text-[11px] text-text-secondary leading-snug">{tone.note}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-text-muted mt-3 pt-3 border-t border-border leading-relaxed">
              Every approval — bulk or individual — re-hashes the stored file and re-checks for duplicates before it
              is counter-signed with your institution&apos;s key.
            </p>
          </Card>

          {isTnteu && (
            <Card className="!p-4">
              <h2 className="font-display text-sm font-bold text-text-primary mb-3">Backlog by university</h2>
              {stats?.perCollege?.length ? (
                <div className="space-y-2.5">
                  {stats.perCollege.map((item) => (
                    <button
                      key={item.collegeId}
                      onClick={() => { setPage(1); setCollegeId(item.collegeId); }}
                      className="w-full text-left"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs text-text-primary truncate">{item.collegeName}</span>
                        <span className="text-xs font-semibold text-text-secondary shrink-0">{item.pending}</span>
                      </div>
                      {item.flagged > 0 && <span className="text-[11px] text-warning">{item.flagged} flagged</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted">Nothing pending.</p>
              )}
            </Card>
          )}

          <Card className="!p-4">
            <h2 className="font-display text-sm font-bold text-text-primary mb-3">Last 7 days</h2>
            {stats?.throughput?.length ? (
              <div className="space-y-1.5">
                {stats.throughput.map((day) => {
                  const total = day.verified + day.rejected;
                  const max = Math.max(...stats.throughput.map((d) => d.verified + d.rejected), 1);
                  return (
                    <div key={day.date}>
                      <div className="flex justify-between text-[11px] text-text-muted mb-0.5">
                        <span>{day.date.slice(5)}</span>
                        <span>{total}</span>
                      </div>
                      <div className="h-1.5 rounded-pill bg-border overflow-hidden flex">
                        <div className="h-full bg-success" style={{ width: `${(day.verified / max) * 100}%` }} />
                        <div className="h-full bg-danger" style={{ width: `${(day.rejected / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted">No reviews recorded yet.</p>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
