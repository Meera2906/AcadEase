import { useEffect, useState } from "react";
import { CalendarCheck, Search, Download, TrendingDown, TrendingUp, Minus } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

export default function AdminAttendance() {
  const [report, setReport]       = useState([]);
  const [depts, setDepts]         = useState([]);
  const [deptId, setDeptId]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const { toast, showToast, clearToast } = useToast();

  async function load() {
    const d = await api.get("/admin/departments");
    setDepts(d.data.departments || []);
    if (d.data.departments?.length) setDeptId(d.data.departments[0].departmentId);
  }

  async function loadReport() {
    if (!deptId) return;
    setLoading(true);
    try {
      const r = await api.get(`/admin/reports/attendance?departmentId=${deptId}`);
      setReport(r.data.report || []);
    } catch { showToast("Failed to load report.", "error"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { loadReport(); }, [deptId]);

  const filtered = report.filter((s) =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.studentId?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: report.length,
    good: report.filter((s) => s.status === "good").length,
    warning: report.filter((s) => s.status === "warning").length,
    danger: report.filter((s) => s.status === "danger").length,
    chronic: report.filter((s) => s.status === "chronic").length,
    noData: report.filter((s) => s.status === "no-data").length,
  };

  const avgPct = report.length ? Math.round(report.reduce((s, r) => s + r.percentage, 0) / report.length * 10) / 10 : 0;

  function exportCSV() {
    const header = "Student ID,Name,Enrollment,Semester,Section,Total Classes,Attended,Percentage,Status\n";
    const rows = report.map((s) =>
      `${s.studentId},"${s.name}",${s.enrollmentNumber || ""},${s.semester},${s.section},${s.total},${s.attended},${s.percentage}%,${s.status}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `attendance_report_${deptId}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2"><CalendarCheck size={22} className="text-signal" /> Attendance Reports</h1>
            <p className="text-sm text-text-secondary mt-0.5">Monitor attendance, identify chronic absentees, and export data.</p>
          </div>
          <button onClick={exportCSV} className="flex items-center gap-2 bg-ink text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-ink-light transition-colors shadow-card">
            <Download size={15} /> Export CSV
          </button>
        </div>

        {/* Dept selector + stats */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="input w-auto min-w-[180px]">
            {depts.map((d) => <option key={d._id} value={d.departmentId}>{d.name} ({d.departmentId})</option>)}
          </select>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student…" className="input pl-8 py-2 text-sm" />
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard icon={CalendarCheck} label="Avg Attendance" value={`${avgPct}%`}
            gradient={avgPct < 75 ? "bg-gradient-danger" : avgPct < 85 ? "bg-gradient-warning" : "bg-gradient-success"} sub={`${stats.total} students`} />
          <StatCard icon={TrendingUp} label="Good (≥85%)" value={stats.good} gradient="bg-gradient-success" sub="Regular attendees" />
          <StatCard icon={Minus} label="Warning (75-84%)" value={stats.warning} gradient="bg-gradient-warning" sub="Needs improvement" />
          <StatCard icon={TrendingDown} label="Danger (65-74%)" value={stats.danger} gradient="bg-gradient-danger" sub="At risk" />
          <StatCard icon={TrendingDown} label="Chronic (<65%)" value={stats.chronic} gradient="bg-gradient-danger" sub="Below threshold" />
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper border-b border-border">
                  {["Student", "ID", "Enroll No.", "Sem", "Section", "Total", "Attended", "%", "Status"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? [1,2,3,4,5].map((i) => (
                  <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-5 bg-border rounded animate-pulse" /></td></tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-text-muted text-sm">No data.</td></tr>
                ) : filtered.map((s) => (
                  <tr key={s.studentId} className="hover:bg-paper/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-text-primary">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{s.studentId}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">{s.enrollmentNumber || "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">{s.semester}</td>
                    <td className="px-4 py-3 text-text-secondary">{s.section}</td>
                    <td className="px-4 py-3 text-text-secondary">{s.total}</td>
                    <td className="px-4 py-3 text-text-secondary">{s.attended}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${s.percentage >= 85 ? "text-success" : s.percentage >= 75 ? "text-warning" : "text-danger"}`}>
                        {s.percentage}%
                      </span>
                    </td>
                    <td className="px-4 py-3"><Badge status={s.status === "good" ? "present" : s.status === "warning" ? "late" : s.status === "danger" ? "absent" : s.status === "chronic" ? "rejected" : "holiday"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-border bg-paper text-xs text-text-muted">{filtered.length} students</div>
        </div>
      </div>
    </AppShell>
  );
}