import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  ClipboardList,
  BookOpen,
  MessageSquareWarning,
  Megaphone,
  GraduationCap,
  ChevronRight,
  Sparkles,
  FileText,
  UserCheck,
  Users,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Card from "../../components/ui/Card.jsx";

function QuickCard({ icon: Icon, label, sub, to, color, count }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="w-full rounded-card border border-border bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
        {count != null && (
          <span className="rounded-pill bg-paper px-2 py-0.5 text-[11px] font-semibold text-text-muted">
            {count}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-text-primary">{label}</p>
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </button>
  );
}

function SectionHeader({ title, to, navigate }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {to && (
        <button onClick={() => navigate(to)} className="flex items-center gap-0.5 text-xs font-medium text-signal hover:underline">
          View all <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

export default function FacultyDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [announcements, setAnnouncements] = useState([]);
  const [materialCounts, setMaterialCounts] = useState({ academic: 0, tet: 0, practiceReady: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get("/admin/dashboard").catch(() => ({ data: {} })),
      api.get("/announcements").catch(() => ({ data: { announcements: [] } })),
      api.get("/study-materials", { params: { moduleType: "academic" } }).catch(() => ({ data: { materials: [] } })),
      api.get("/study-materials", { params: { moduleType: "tet" } }).catch(() => ({ data: { materials: [] } })),
    ])
      .then(([dash, anns, academicRes, tetRes]) => {
        const academicMaterials = academicRes.data.materials || [];
        const tetMaterials = tetRes.data.materials || [];
        const practiceReady = [...academicMaterials, ...tetMaterials].filter((item) => ["quiz", "paper"].includes(item.contentType)).length;

        setStats(dash.data || {});
        setAnnouncements(anns.data.announcements || []);
        setMaterialCounts({
          academic: academicMaterials.length,
          tet: tetMaterials.length,
          practiceReady,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-card border border-border bg-white animate-pulse" />)}
        </div>
      </AppShell>
    );
  }

  const resourceLabel = `${materialCounts.academic} academic · ${materialCounts.tet} TET`;

  return (
    <AppShell>
      <div className="min-h-screen bg-paper p-4 md:p-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">Faculty Dashboard</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <button onClick={() => navigate("/admin/announcements")} className="inline-flex items-center gap-2 rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-signal-dark">
            <Megaphone size={15} /> New announcement
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={CalendarCheck}
            label="Attendance"
            value={stats?.todaysClassesMarked ?? "—"}
            gradient="bg-gradient-warning"
            sub="Classes marked today"
            onClick={() => navigate("/faculty/attendance")}
          />
          <StatCard
            icon={ClipboardList}
            label="Results"
            value={stats?.resultsPendingCount ?? 0}
            gradient="bg-gradient-success"
            sub="Pending review"
            onClick={() => navigate("/faculty/results")}
          />
          <StatCard
            icon={BookOpen}
            label="Study Materials"
            value={`${materialCounts.academic + materialCounts.tet}`}
            gradient="bg-ink-fade"
            sub={resourceLabel}
            onClick={() => navigate("/admin/study-materials")}
          />
          <StatCard
            icon={MessageSquareWarning}
            label="OD Requests"
            value={stats?.pendingOdRequests ?? 0}
            gradient="bg-gradient-danger"
            sub="Awaiting review"
            onClick={() => navigate("/faculty/od-requests")}
          />
        </div>

        <div>
          <SectionHeader title="Modules" navigate={navigate} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <QuickCard icon={CalendarCheck} label="Attendance" sub="Mark and review sessions" to="/faculty/attendance" color="bg-signal" />
            <QuickCard icon={ClipboardList} label="Results" sub="Enter marks and outcomes" to="/faculty/results" color="bg-success" />
            <QuickCard icon={BookOpen} label="Materials" sub="Upload lessons and notes" to="/admin/study-materials" color="bg-ink" />
            <QuickCard icon={MessageSquareWarning} label="OD Requests" sub="Review pending approvals" to="/faculty/od-requests" color="bg-danger" />
            <QuickCard icon={Megaphone} label="Announcements" sub="Share updates quickly" to="/admin/announcements" color="bg-citrus" />
            <QuickCard icon={UserCheck} label="Profile" sub="Support student records" to="/faculty/profile" color="bg-teal" />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Faculty workspace</h2>
              <button onClick={() => navigate("/admin/study-materials")} className="text-xs font-medium text-signal hover:underline">
                Open materials
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => navigate("/faculty/attendance")} className="rounded-xl border border-border bg-paper p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-signal">
                  <CalendarCheck size={18} className="text-white" />
                </div>
                <p className="text-sm font-semibold text-text-primary">Mark attendance</p>
                <p className="mt-1 text-xs text-text-muted">Track class participation and update records.</p>
              </button>
              <button onClick={() => navigate("/faculty/results")} className="rounded-xl border border-border bg-paper p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-success">
                  <ClipboardList size={18} className="text-white" />
                </div>
                <p className="text-sm font-semibold text-text-primary">Enter results</p>
                <p className="mt-1 text-xs text-text-muted">Review assessments and submit outcomes.</p>
              </button>
              <button onClick={() => navigate("/admin/study-materials")} className="rounded-xl border border-border bg-paper p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-ink">
                  <BookOpen size={18} className="text-white" />
                </div>
                <p className="text-sm font-semibold text-text-primary">Upload content</p>
                <p className="mt-1 text-xs text-text-muted">Publish academic modules, TET prep, and quizzes.</p>
              </button>
              <button onClick={() => navigate("/faculty/od-requests")} className="rounded-xl border border-border bg-paper p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-danger">
                  <MessageSquareWarning size={18} className="text-white" />
                </div>
                <p className="text-sm font-semibold text-text-primary">Review OD requests</p>
                <p className="mt-1 text-xs text-text-muted">Approve or reject student on-duty submissions.</p>
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-paper/70 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">Learning resources</p>
                  <p className="text-xs text-text-muted">Available for student support right now</p>
                </div>
                <span className="rounded-pill bg-signal/10 px-2.5 py-1 text-[11px] font-semibold text-signal">
                  {materialCounts.practiceReady} practice ready
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white p-3 text-center shadow-card">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">Academic</p>
                  <p className="mt-2 text-2xl font-bold text-text-primary">{materialCounts.academic}</p>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-card">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">TET</p>
                  <p className="mt-2 text-2xl font-bold text-text-primary">{materialCounts.tet}</p>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-card">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">Practice</p>
                  <p className="mt-2 text-2xl font-bold text-text-primary">{materialCounts.practiceReady}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Recent announcements" to="/admin/announcements" navigate={navigate} />
            <div className="space-y-3">
              {announcements.slice(0, 4).map((item) => (
                <div key={item._id} className="rounded-xl border border-border bg-paper p-3">
                  <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                  <p className="mt-1 text-xs text-text-muted">{item.body}</p>
                </div>
              ))}
              {announcements.length === 0 && <p className="text-sm text-text-muted">No announcements yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
