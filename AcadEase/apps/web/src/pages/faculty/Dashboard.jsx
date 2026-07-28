import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, ClipboardList, BookOpen, MessageSquareWarning, Megaphone, GraduationCap, ChevronRight, Sparkles } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Card from "../../components/ui/Card.jsx";

function QuickCard({ icon: Icon, label, sub, to, color }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(to)} className="w-full rounded-card border border-border bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-sm font-semibold text-text-primary">{label}</p>
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </button>
  );
}

export default function FacultyDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get("/admin/dashboard").catch(() => ({ data: {} })),
      api.get("/announcements").catch(() => ({ data: { announcements: [] } })),
    ]).then(([dash, anns]) => {
      setStats({
        ...dash.data,
        announcements: anns.data.announcements || [],
      });
    }).finally(() => setLoading(false));
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

  return (
    <AppShell>
      <div className="min-h-screen bg-paper p-4 md:p-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">Faculty Dashboard</h1>
            <p className="mt-1 text-sm text-text-secondary">Handle attendance, results, and student learning resources in one place.</p>
          </div>
          <button onClick={() => navigate("/admin/announcements")} className="inline-flex items-center gap-2 rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-signal-dark">
            <Megaphone size={15} /> New announcement
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={CalendarCheck} label="Attendance" value="Mark now" gradient="bg-gradient-warning" sub="Daily class updates" onClick={() => navigate("/faculty/attendance")} />
          <StatCard icon={ClipboardList} label="Results" value="Enter marks" gradient="bg-gradient-success" sub="Assessment entry" onClick={() => navigate("/faculty/results")} />
          <StatCard icon={BookOpen} label="Study Materials" value="Upload" gradient="bg-ink-fade" sub="Academic + TET" onClick={() => navigate("/admin/study-materials")} />
          <StatCard icon={MessageSquareWarning} label="OD Requests" value="Review" gradient="bg-gradient-danger" sub="Pending requests" onClick={() => navigate("/faculty/od-requests")} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Quick actions</h2>
              <button onClick={() => navigate("/admin/study-materials")} className="text-xs font-medium text-signal hover:underline">Open materials</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickCard icon={GraduationCap} label="Students" sub="Track performance" to="/faculty/attendance" color="bg-signal" />
              <QuickCard icon={Sparkles} label="TET Prep" sub="Support exam practice" to="/admin/study-materials?tab=tet" color="bg-citrus" />
              <QuickCard icon={BookOpen} label="Academic Modules" sub="Upload lessons" to="/admin/study-materials?tab=academic" color="bg-success" />
              <QuickCard icon={Megaphone} label="Announcements" sub="Share updates" to="/admin/announcements" color="bg-ink" />
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Recent announcements</h2>
              <button onClick={() => navigate("/admin/announcements")} className="flex items-center gap-0.5 text-xs font-medium text-signal hover:underline">
                View all <ChevronRight size={13} />
              </button>
            </div>
            <div className="space-y-3">
              {(stats.announcements || []).slice(0, 4).map((item) => (
                <div key={item._id} className="rounded-xl border border-border bg-paper p-3">
                  <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                  <p className="mt-1 text-xs text-text-muted">{item.body}</p>
                </div>
              ))}
              {(stats.announcements || []).length === 0 && <p className="text-sm text-text-muted">No announcements yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
