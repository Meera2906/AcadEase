import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Clock, FileCheck2,
  Gauge, Building2, Inbox,
} from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

export default function VerificationQueue() {
  const [queue, setQueue] = useState({ documents: [], page: 1, totalPages: 1, total: 0 });
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [flagged, setFlagged] = useState("");
  const [collegeId, setCollegeId] = useState("");
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
    } catch (err) {
      showToast(err.response?.data?.error || "Could not load the queue.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, flagged, collegeId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/admissions/meta").then((res) => setMeta(res.data)).catch(() => {}); }, []);

  const flagLabel = (flag) => meta?.flagLabels?.[flag] || flag;

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Document Verification Queue</h1>
      <p className="text-sm text-text-secondary mb-6">
        Documents submitted by affiliated universities, flagged ones first. Every decision here is yours —
        the flags only tell you where to look.
      </p>

      {/* System-wide throughput, aggregated in the database */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Inbox} label="Awaiting review" value={stats?.documents.pending} gradient="bg-ink" />
        <StatCard icon={FileCheck2} label="Verified" value={stats?.documents.verified} gradient="bg-success" />
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

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Queue */}
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

              <input
                value={collegeId}
                onChange={(event) => { setPage(1); setCollegeId(event.target.value); }}
                placeholder="Filter by university ID"
                className="px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-signal/30 flex-1 min-w-[180px]"
              />

              <span className="text-xs text-text-muted ml-auto">{queue.total} in queue</span>
            </div>
          </Card>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-white border border-border rounded-card animate-pulse" />)}
            </div>
          ) : queue.documents.length === 0 ? (
            <Card className="text-center py-12">
              <FileCheck2 size={28} className="text-success mx-auto mb-3" />
              <p className="text-sm font-semibold text-text-primary">Queue is clear</p>
              <p className="text-xs text-text-secondary mt-1">No documents are waiting for review.</p>
            </Card>
          ) : (
            <div className="border border-border rounded-card overflow-hidden bg-card">
              <div className="hidden md:grid grid-cols-[1.4fr_1.2fr_1.4fr_auto] gap-4 px-4 py-2.5 bg-paper border-b border-border text-xs font-semibold text-text-secondary">
                <span>Applicant</span>
                <span>Document</span>
                <span>Checks</span>
                <span>Waiting</span>
              </div>
              <div className="divide-y divide-border">
                {queue.documents.map((doc) => (
                  <Link
                    key={doc._id}
                    to={`/admin/verification/${doc._id}`}
                    className={`grid md:grid-cols-[1.4fr_1.2fr_1.4fr_auto] gap-4 px-4 py-3 items-center hover:bg-paper transition-colors ${
                      doc.flagCount > 0 ? "border-l-2 border-l-warning" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{doc.applicantName || doc.applicantId}</p>
                      <p className="text-xs text-text-muted">{doc.collegeName}</p>
                    </div>

                    <div>
                      <p className="text-sm text-text-primary">{doc.label}</p>
                      <p className="text-xs text-text-muted font-mono">{doc.applicantId}</p>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {doc.flags.length === 0 ? (
                        <span className="text-xs text-success font-medium">No issues detected</span>
                      ) : (
                        doc.flags.map((flag) => (
                          <span
                            key={flag}
                            title={flagLabel(flag)}
                            className="px-2 py-0.5 rounded-pill bg-[#FFF3DC] text-warning text-[11px] font-semibold flex items-center gap-1"
                          >
                            <AlertTriangle size={10} /> {flag.replace(/_/g, " ")}
                          </span>
                        ))
                      )}
                    </div>

                    <span className="text-xs text-text-muted flex items-center gap-1 whitespace-nowrap">
                      <Clock size={12} /> {doc.waitingHours}h
                    </span>
                  </Link>
                ))}
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

        {/* Per-university backlog */}
        <div className="space-y-4">
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
                    {item.flagged > 0 && (
                      <span className="text-[11px] text-warning">{item.flagged} flagged</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">Nothing pending.</p>
            )}
          </Card>

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
