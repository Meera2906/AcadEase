import { useEffect, useState } from "react";
import { BarChart2, Download, Users, GraduationCap, TrendingUp, CalendarCheck, BookOpen, ClipboardList } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

export default function AdminReports() {
  const [depts, setDepts] = useState([]);
  const [deptId, setDeptId] = useState("");
  const [dashData, setDashData] = useState(null);
  const [attendanceReport, setAttendanceReport] = useState([]);
  const [marksReport, setMarksReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast, showToast, clearToast } = useToast();

  async function load() {
    try {
      const [d, dash, att, marks] = await Promise.all([
        api.get("/admin/departments"),
        api.get("/admin/dashboard"),
        deptId ? api.get(`/admin/reports/attendance?departmentId=${deptId}`) : Promise.resolve({ data: { report: [] } }),
        deptId ? api.get(`/admin/reports/marks?departmentId=${deptId}`) : Promise.resolve({ data: { report: [] } }),
      ]);
      setDepts(d.data.departments || []);
      setDashData(dash.data);
      setAttendanceReport(att.data.report || []);
      setMarksReport(marks.data.report || []);
      if (!deptId && d.data.departments?.length) setDeptId(d.data.departments[0].departmentId);
    } catch { showToast("Failed to load reports.", "error"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (deptId) load(); }, [deptId]);

  const avgAtt = attendanceReport.length
    ? Math.round(attendanceReport.reduce((s, r) => s + r.percentage, 0) / attendanceReport.length * 10) / 10
    : 0;

  // Flatten marks report for export
  function exportMarksCSV() {
    const rows = ["Course ID,Course Name,Assessment Type,Title,Max Marks,Average,Students Graded\n"];
    marksReport.forEach((c) => {
      c.assessments?.forEach((a) => {
        rows.push(`${c.courseId},"${c.courseName}",${a.type},"${a.title}",${a.maxMarks},${a.avg},${a.count}\n`);
      });
    });
    const blob = new Blob(rows, { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `marks_report_${deptId}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      <div className="p-4 md:p-6 space-y-6 bg-paper min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2"><BarChart2 size={22} className="text-signal" /> Reports & Analytics</h1>
            <p className="text-sm text-text-secondary mt-0.5">Comprehensive reports on attendance, performance, enrollment, and more.</p>
          </div>
          <div className="flex gap-2">
            <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="input w-auto min-w-[180px]">
              {depts.map((d) => <option key={d._id} value={d.departmentId}>{d.name}</option>)}
            </select>
            <Button variant="secondary" size="sm" onClick={exportMarksCSV} className="flex items-center gap-1.5">
              <Download size={14} /> Export Marks
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[1,2,3,4].map((i) => <div key={i} className="h-40 bg-white border border-border rounded-card animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* Institution overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={GraduationCap} label="Total Students" value={dashData?.totalStudents ?? 0} gradient="bg-ink-fade" sub="Enrolled" />
              <StatCard icon={Users} label="Faculty" value={dashData?.totalFaculty ?? 0} gradient="bg-gradient-teal" sub="Active staff" />
              <StatCard icon={CalendarCheck} label="Avg Attendance" value={`${avgAtt}%`}
                gradient={avgAtt < 75 ? "bg-gradient-danger" : avgAtt < 85 ? "bg-gradient-warning" : "bg-gradient-success"} sub="Department average" />
              <StatCard icon={ClipboardList} label="Results Pending" value={dashData?.resultsPendingCount ?? 0}
                gradient={dashData?.resultsPendingCount > 0 ? "bg-gradient-warning" : "bg-ink-fade"} sub="Unpublished assessments" />
            </div>

            {/* Attendance distribution */}
            <Card>
              <h2 className="font-display text-base font-semibold text-text-primary mb-4 flex items-center gap-2"><CalendarCheck size={18} className="text-signal" /> Attendance Distribution</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-paper border-b border-border">
                      {["Status", "Count", "Percentage", "Color"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      { label: "Good (≥85%)", count: attendanceReport.filter((s) => s.status === "good").length, color: "bg-success" },
                      { label: "Warning (75-84%)", count: attendanceReport.filter((s) => s.status === "warning").length, color: "bg-warning" },
                      { label: "Danger (65-74%)", count: attendanceReport.filter((s) => s.status === "danger").length, color: "bg-coral" },
                      { label: "Chronic (<65%)", count: attendanceReport.filter((s) => s.status === "chronic").length, color: "bg-danger" },
                      { label: "No Data", count: attendanceReport.filter((s) => s.status === "no-data").length, color: "bg-border" },
                    ].map((r) => {
                      const pct = attendanceReport.length ? Math.round((r.count / attendanceReport.length) * 100) : 0;
                      return (
                        <tr key={r.label}>
                          <td className="px-4 py-2.5 font-medium text-text-primary">{r.label}</td>
                          <td className="px-4 py-2.5 text-text-secondary">{r.count}</td>
                          <td className="px-4 py-2.5 text-text-secondary">{pct}%</td>
                          <td className="px-4 py-2.5"><div className={`w-6 h-6 rounded ${r.color}`} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Marks overview */}
            <Card>
              <h2 className="font-display text-base font-semibold text-text-primary mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-signal" /> Marks Overview by Course</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-paper border-b border-border">
                      {["Course ID", "Course Name", "Assessments", "Average Marks"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {marksReport.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-text-muted text-sm">No marks data available.</td></tr>
                    ) : marksReport.map((c) => {
                      const avgs = c.assessments?.filter((a) => a.count > 0).map((a) => a.avg) || [];
                      const overallAvg = avgs.length ? Math.round(avgs.reduce((s, v) => s + v, 0) / avgs.length * 10) / 10 : 0;
                      return (
                        <tr key={c.courseId}>
                          <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{c.courseId}</td>
                          <td className="px-4 py-2.5 font-medium text-text-primary">{c.courseName}</td>
                          <td className="px-4 py-2.5 text-text-secondary">{c.assessments?.length || 0}</td>
                          <td className="px-4 py-2.5">
                            <span className={`font-semibold ${overallAvg >= 75 ? "text-success" : overallAvg >= 60 ? "text-warning" : "text-danger"}`}>
                              {overallAvg || "—"}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}