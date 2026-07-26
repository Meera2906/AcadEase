import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, CalendarCheck, FileBadge, MessageSquareWarning, ClipboardList, AlertTriangle } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Card from "../../components/ui/Card.jsx";

export default function AdminDashboard() {
  const [data, setData]         = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get("/admin/dashboard"),
      api.get("/admin/users?role=student"),
    ])
      .then(([dash, users]) => { setData(dash.data); setStudents(users.data.users); })
      .finally(() => setLoading(false));
  }, []);

  const avg = data?.departmentAverageAttendanceToday ?? 0;

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Admin Dashboard</h1>
      <p className="text-sm text-text-secondary mb-6">Department overview — live data.</p>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[1,2,3,4,5,6].map((i) => <div key={i} className="h-28 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <StatCard
              icon={CalendarCheck} label="Avg. Attendance" value={`${avg}%`}
              gradient={avg < 75 ? "bg-gradient-danger" : avg < 85 ? "bg-gradient-warning" : "bg-gradient-success"}
              sub="Across all students"
            />
            <StatCard
              icon={AlertTriangle} label="Chronic Absentees" value={data?.chronicAbsenteeCount ?? 0}
              gradient={data?.chronicAbsenteeCount > 0 ? "bg-gradient-danger" : "bg-ink-fade"}
              sub="Below 65% attendance"
            />
            <StatCard
              icon={FileBadge} label="Pending Certificates" value={data?.pendingCertificates ?? 0}
              gradient={data?.pendingCertificates > 0 ? "bg-gradient-warning" : "bg-ink-fade"}
              sub="Awaiting approval"
              onClick={() => navigate("/admin/certificates")}
            />
            <StatCard
              icon={MessageSquareWarning} label="Open Grievances" value={data?.pendingGrievances ?? 0}
              gradient={data?.pendingGrievances > 0 ? "bg-gradient-warning" : "bg-ink-fade"}
              sub="Open + In Review"
              onClick={() => navigate("/admin/grievances")}
            />
            <StatCard
              icon={ClipboardList} label="Results Pending" value={data?.resultsPendingCount ?? 0}
              gradient={data?.resultsPendingCount > 0 ? "bg-gradient-warning" : "bg-ink-fade"}
              sub="Assessments without marks"
            />
            <StatCard
              icon={Users} label="Classes Marked Today" value={data?.todaysClassesMarked ?? 0}
              gradient="bg-ink-fade"
              sub="Attendance records today"
            />
          </div>

          <h2 className="font-display text-lg font-semibold text-text-primary mb-3">
            Students ({students.length})
          </h2>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-paper border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Dept</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Sem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s) => (
                    <tr
                      key={s._id}
                      onClick={() => navigate(`/profile/${s.userId}`)}
                      className="hover:bg-[#EEF1FF] cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-signal text-white flex items-center justify-center text-xs font-bold font-display shrink-0">
                            {s.name?.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                          </div>
                          <span className="font-medium text-text-primary hover:text-signal">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-muted font-mono text-xs">{s.userId}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.departmentId}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.semester}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
