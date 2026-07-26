import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, CalendarCheck, FileBadge, MessageSquareWarning,
  ClipboardList, AlertTriangle, BookOpen, Megaphone,
  TrendingUp, GraduationCap, BarChart2, ChevronRight,
  CheckCircle, Clock, UserCheck, Building2,
} from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";

function QuickCard({ icon: Icon, label, sub, to, color, count }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="bg-white border border-border rounded-card p-4 shadow-card hover:shadow-lift hover:-translate-y-0.5 transition-all text-left group w-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
        {count != null && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-pill ${count > 0 ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
            {count}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-text-primary group-hover:text-signal transition-colors">{label}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </button>
  );
}

function SectionHeader({ title, to, navigate }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {to && (
        <button onClick={() => navigate(to)} className="text-xs text-signal font-medium flex items-center gap-0.5 hover:underline">
          View all <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData]     = useState(null);
  const [students, setStudents] = useState([]);
  const [faculty, setFaculty]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get("/admin/dashboard"),
      api.get("/admin/users?role=student"),
      api.get("/admin/users?role=faculty"),
    ])
      .then(([dash, stu, fac]) => {
        setData(dash.data);
        setStudents(stu.data.users || []);
        setFaculty(fac.data.users || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const avg = data?.departmentAverageAttendanceToday ?? 0;

  if (loading) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 space-y-4">
          {[1,2,3,4].map((i) => <div key={i} className="h-28 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-6 bg-paper min-h-screen">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">Admin Dashboard</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <button
            onClick={() => navigate("/admin/announcements")}
            className="flex items-center gap-2 bg-signal text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-signal-dark transition-colors shadow-card"
          >
            <Megaphone size={15} /> New Announcement
          </button>
        </div>

        {/* ── Stat cards row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={GraduationCap} label="Total Students" value={data?.totalStudents ?? students.length}
            gradient="bg-ink-fade" sub="Enrolled this semester" />
          <StatCard icon={UserCheck} label="Faculty" value={data?.totalFaculty ?? faculty.length}
            gradient="bg-gradient-teal" sub="Active staff" />
          <StatCard icon={CalendarCheck} label="Avg. Attendance"
            value={`${avg}%`}
            gradient={avg < 75 ? "bg-gradient-danger" : avg < 85 ? "bg-gradient-warning" : "bg-gradient-success"}
            sub="Department average" />
          <StatCard icon={AlertTriangle} label="Chronic Absentees"
            value={data?.chronicAbsenteeCount ?? 0}
            gradient={data?.chronicAbsenteeCount > 0 ? "bg-gradient-danger" : "bg-ink-fade"}
            sub="Below 65% attendance" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={FileBadge} label="Pending Certificates"
            value={data?.pendingCertificates ?? 0}
            gradient={data?.pendingCertificates > 0 ? "bg-gradient-warning" : "bg-ink-fade"}
            sub="Awaiting approval" onClick={() => navigate("/admin/certificates")} />
          <StatCard icon={MessageSquareWarning} label="Open Grievances"
            value={data?.pendingGrievances ?? 0}
            gradient={data?.pendingGrievances > 0 ? "bg-gradient-warning" : "bg-ink-fade"}
            sub="Open + In Review" onClick={() => navigate("/admin/grievances")} />
          <StatCard icon={ClipboardList} label="Results Pending"
            value={data?.resultsPendingCount ?? 0}
            gradient={data?.resultsPendingCount > 0 ? "bg-gradient-warning" : "bg-ink-fade"}
            sub="Assessments without marks" />
          <StatCard icon={CalendarCheck} label="Classes Marked Today"
            value={data?.todaysClassesMarked ?? 0}
            gradient="bg-ink-fade" sub="Attendance records today" />
        </div>

        {/* ── Quick access modules ── */}
        <div>
          <SectionHeader title="Modules" navigate={navigate} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <QuickCard icon={Users}              label="User Management"    sub="Students & faculty"     to="/admin/users"         color="bg-signal" />
            <QuickCard icon={Building2}          label="Departments"        sub="Manage departments"     to="/admin/departments"   color="bg-teal" />
            <QuickCard icon={BookOpen}           label="Courses"            sub="Subjects & allocation"  to="/admin/courses"       color="bg-success" />
            <QuickCard icon={CalendarCheck}      label="Attendance"         sub="Reports & policies"     to="/admin/attendance"    color="bg-warning" count={data?.chronicAbsenteeCount} />
            <QuickCard icon={TrendingUp}         label="Marks & Results"    sub="Approve & publish"      to="/admin/marks"         color="bg-coral" count={data?.resultsPendingCount} />
            <QuickCard icon={FileBadge}          label="Certificates"       sub="Approve requests"       to="/admin/certificates"  color="bg-signal" count={data?.pendingCertificates} />
            <QuickCard icon={MessageSquareWarning} label="Grievances"       sub="Review & resolve"       to="/admin/grievances"    color="bg-danger" count={data?.pendingGrievances} />
            <QuickCard icon={Megaphone}          label="Announcements"      sub="Notices & circulars"    to="/admin/announcements" color="bg-ink" />
            <QuickCard icon={BarChart2}          label="Reports"            sub="Analytics & exports"    to="/admin/reports"       color="bg-teal" />
            <QuickCard icon={GraduationCap}      label="Enrollment"         sub="Student admission"      to="/admin/users"         color="bg-success" />
          </div>
        </div>

        {/* ── Bottom row: Recent activity + Student list ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Recent grievances */}
          <div className="bg-white border border-border rounded-card shadow-card p-5">
            <SectionHeader title="Recent Grievances" to="/admin/grievances" navigate={navigate} />
            <div className="space-y-3">
              {(data?.recentGrievances || []).length === 0 && (
                <p className="text-xs text-text-muted text-center py-4">No grievances yet.</p>
              )}
              {(data?.recentGrievances || []).map((g) => (
                <div key={g._id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{g.subject}</p>
                    <p className="text-xs text-text-muted">{g.category} · {new Date(g.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge status={g.status?.toLowerCase()} />
                </div>
              ))}
            </div>
          </div>

          {/* Recent certificate requests */}
          <div className="bg-white border border-border rounded-card shadow-card p-5">
            <SectionHeader title="Recent Certificate Requests" to="/admin/certificates" navigate={navigate} />
            <div className="space-y-3">
              {(data?.recentCertRequests || []).length === 0 && (
                <p className="text-xs text-text-muted text-center py-4">No requests yet.</p>
              )}
              {(data?.recentCertRequests || []).map((r) => (
                <div key={r._id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary capitalize">{r.type} Certificate</p>
                    <p className="text-xs text-text-muted font-mono">{r.studentId} · {new Date(r.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge status={r.status} />
                </div>
              ))}
            </div>
          </div>

          {/* Faculty list */}
          <div className="bg-white border border-border rounded-card shadow-card p-5">
            <SectionHeader title={`Faculty (${faculty.length})`} to="/admin/users" navigate={navigate} />
            <div className="space-y-2">
              {faculty.slice(0, 5).map((f) => (
                <div key={f._id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {f.name?.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{f.name}</p>
                    <p className="text-xs text-text-muted">{f.designation || "Faculty"} · {f.departmentId}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Students table ── */}
        <div>
          <SectionHeader title={`Students (${students.length})`} to="/admin/users" navigate={navigate} />
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-paper border-b border-border">
                    {["Name", "ID", "Enroll No.", "Dept", "Sem", "Section"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.slice(0, 10).map((s) => (
                    <tr key={s._id} onClick={() => navigate(`/profile/${s.userId}`)}
                      className="hover:bg-[#EEF1FF] cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-signal text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {s.name?.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                          </div>
                          <span className="font-medium text-text-primary">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-muted font-mono text-xs">{s.userId}</td>
                      <td className="px-4 py-3 text-text-muted font-mono text-xs">{s.enrollmentNumber || "—"}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.departmentId}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.semester}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.section || "A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {students.length > 10 && (
                <div className="px-4 py-3 border-t border-border bg-paper text-center">
                  <button onClick={() => navigate("/admin/users")} className="text-xs text-signal font-medium hover:underline">
                    View all {students.length} students →
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>

      </div>
    </AppShell>
  );
}
