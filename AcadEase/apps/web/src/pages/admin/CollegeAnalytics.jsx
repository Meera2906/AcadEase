import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart2, Building2, Users, GraduationCap, ClipboardCheck,
  Landmark, AlertTriangle, ArrowUpDown,
} from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const SORTS = [
  { key: "name", label: "Name", get: (c) => c.name, dir: 1 },
  { key: "utilisation", label: "Seat fill", get: (c) => c.seats.utilisation, dir: -1 },
  { key: "pending", label: "Pending work", get: (c) => c.documents.pending + c.requests.pending, dir: -1 },
  { key: "attendance", label: "Attendance", get: (c) => c.attendance.average ?? -1, dir: 1 },
  { key: "approval", label: "Approval rate", get: (c) => c.admissions.approvalRate ?? -1, dir: 1 },
];

// A filled track, not a chart: one number per college, read down the column.
function Meter({ value, max = 100, tone = "signal" }) {
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const colour = tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : "bg-signal";
  return (
    <div className="h-1.5 w-full rounded-pill bg-[#F1EFE6] overflow-hidden">
      <div className={`h-full rounded-pill ${colour}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function attendanceTone(value) {
  if (value == null) return "signal";
  if (value < 65) return "danger";
  if (value < 75) return "warning";
  return "success";
}

export default function CollegeAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("pending");
  const { toast, showToast, clearToast } = useToast();

  useEffect(() => {
    api.get("/admin/analytics/colleges")
      .then((r) => setData(r.data))
      .catch((e) => showToast(e.response?.data?.error || "Could not load the analysis.", "error"))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const sort = SORTS.find((s) => s.key === sortKey) || SORTS[0];
    return [...data.colleges].sort((a, b) => {
      const av = sort.get(a);
      const bv = sort.get(b);
      if (typeof av === "string") return av.localeCompare(bv) * sort.dir;
      return (av - bv) * sort.dir;
    });
  }, [data, sortKey]);

  const totals = data?.totals;

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
          <BarChart2 size={22} className="text-citrus" /> College-wise Analysis
        </h1>
        {data && (
          <p className="text-xs text-text-muted">
            As at {new Date(data.generatedAt).toLocaleString("en-IN")}
          </p>
        )}
      </div>
      <p className="text-sm text-text-secondary mb-6 max-w-3xl">
        Every affiliated college on one page: how much of the sanctioned intake is actually filled, how much
        verification work is still sitting with each office, and where attendance and welfare are slipping.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Building2} label="Affiliated colleges" value={totals?.colleges} gradient="bg-ink" />
        <StatCard
          icon={GraduationCap}
          label="Seats filled"
          value={totals ? `${totals.seatUtilisation}%` : undefined}
          sub={totals ? `${totals.enrolled} of ${totals.sanctioned} sanctioned` : ""}
          gradient="bg-signal"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Documents pending"
          value={totals?.pendingDocuments}
          sub={`${totals?.pendingRequests ?? 0} college requests waiting`}
          gradient="bg-ink-fade"
        />
        <StatCard
          icon={Users}
          label="Students on roll"
          value={totals?.students}
          sub={totals?.studentFacultyRatio ? `${totals.studentFacultyRatio}:1 student–faculty` : ""}
          gradient="bg-success"
        />
      </div>

      <Card className="mb-4 !p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
            <ArrowUpDown size={13} /> Sort by
          </span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key)}
              className={`px-3.5 py-1.5 rounded-pill text-xs font-semibold transition-all ${
                sortKey === s.key ? "bg-ink text-white" : "bg-white border border-border text-text-secondary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-40 bg-white border border-border rounded-card animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="text-center py-12">
          <Building2 size={26} className="text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No colleges on record yet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((c) => {
            const pendingWork = c.documents.pending + c.requests.pending;
            return (
              <Card key={c.collegeId} className="!p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display text-base font-bold text-text-primary">{c.name}</h2>
                      <Badge status={c.status === "active" ? "active" : "pending"}>{c.status}</Badge>
                      {pendingWork > 0 && (
                        <span className="px-3 py-1 rounded-pill text-xs font-semibold bg-[#FFF3DC] text-warning">
                          {pendingWork} item(s) awaiting TNTEU
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      <span className="font-mono">{c.collegeId}</span>
                      {c.affiliationCode ? ` · Affiliation ${c.affiliationCode}` : ""}
                      {c.district ? ` · ${c.district}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/admin/university-requests?collegeId=${c.collegeId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-semibold border border-border text-text-primary bg-white hover:bg-paper"
                    >
                      <Landmark size={13} /> Requests
                    </Link>
                    <Link
                      to={`/admin/umis?collegeId=${c.collegeId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-semibold border border-border text-text-primary bg-white hover:bg-paper"
                    >
                      <Users size={13} /> Students
                    </Link>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {/* Intake */}
                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-1.5">Seat utilisation</p>
                    <p className="font-display text-2xl font-bold text-text-primary leading-none">
                      {c.seats.utilisation}%
                    </p>
                    <p className="text-xs text-text-muted mt-1 mb-2">
                      {c.seats.filled} filled of {c.seats.sanctioned} · {c.seats.vacant} vacant
                    </p>
                    <Meter value={c.seats.utilisation} tone={c.seats.utilisation < 60 ? "warning" : "success"} />
                    <p className="text-[11px] text-text-muted mt-1.5">B.Ed {c.seats.bed} · M.Ed {c.seats.med}</p>
                  </div>

                  {/* Admissions */}
                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-1.5">Admissions</p>
                    <p className="font-display text-2xl font-bold text-text-primary leading-none">
                      {c.admissions.applicants}
                    </p>
                    <p className="text-xs text-text-muted mt-1 mb-2">
                      applicants · {c.admissions.verified} verified · {c.admissions.rejected} rejected
                    </p>
                    <Meter value={c.admissions.approvalRate ?? 0} tone={(c.admissions.approvalRate ?? 0) < 70 ? "warning" : "success"} />
                    <p className="text-[11px] text-text-muted mt-1.5">
                      {c.admissions.approvalRate == null ? "No decisions yet" : `${c.admissions.approvalRate}% approval rate`}
                      {" · "}{c.admissions.submitted + c.admissions.underReview} in queue
                    </p>
                  </div>

                  {/* Attendance */}
                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-1.5">Average attendance</p>
                    <p className="font-display text-2xl font-bold text-text-primary leading-none">
                      {c.attendance.average != null ? `${c.attendance.average}%` : "—"}
                    </p>
                    <p className="text-xs text-text-muted mt-1 mb-2">
                      {c.attendance.tracked} student(s) tracked
                    </p>
                    <Meter value={c.attendance.average ?? 0} tone={attendanceTone(c.attendance.average)} />
                    <p className="text-[11px] text-text-muted mt-1.5 flex items-center gap-1">
                      {c.attendance.chronicAbsentees > 0 && <AlertTriangle size={11} className="text-danger" />}
                      {c.attendance.chronicAbsentees} below 65%
                    </p>
                  </div>

                  {/* Standing */}
                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-1.5">People &amp; standing</p>
                    <p className="font-display text-2xl font-bold text-text-primary leading-none">
                      {c.people.students}
                    </p>
                    <p className="text-xs text-text-muted mt-1 mb-2">
                      students · {c.people.faculty} faculty · {c.people.admins} office
                    </p>
                    <dl className="space-y-0.5 text-[11px] text-text-muted">
                      <div className="flex justify-between"><dt>Documents pending</dt><dd className="font-semibold text-text-secondary">{c.documents.pending}</dd></div>
                      <div className="flex justify-between"><dt>Requests pending</dt><dd className="font-semibold text-text-secondary">{c.requests.pending}</dd></div>
                      <div className="flex justify-between"><dt>Open grievances</dt><dd className="font-semibold text-text-secondary">{c.grievances.open}</dd></div>
                      <div className="flex justify-between"><dt>Certificates issued</dt><dd className="font-semibold text-text-secondary">{c.certificatesIssued}</dd></div>
                    </dl>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
