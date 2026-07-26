import { useEffect, useState } from "react";
import { ClipboardList, Search, CheckCircle, XCircle, TrendingUp, BookOpen } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

export default function AdminMarks() {
  const [assessments, setAssessments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [depts, setDepts] = useState([]);
  const [deptFilter, setDeptFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast, showToast, clearToast } = useToast();

  async function load() {
    const [a, c, d] = await Promise.all([
      api.get("/assessments"),
      api.get("/admin/courses"),
      api.get("/admin/departments"),
    ]);
    setAssessments(a.data.assessments || []);
    setCourses(c.data.courses || []);
    setDepts(d.data.departments || []);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function togglePublish(assessmentId, current) {
    try {
      await api.patch(`/assessments/${assessmentId}/publish`, { marksPublished: !current });
      showToast(`Marks ${current ? "unpublished" : "published"}.`, "success");
      load();
    } catch (ex) { showToast(ex.response?.data?.error || "Failed.", "error"); }
  }

  const filtered = assessments.filter((a) => {
    const course = courses.find((c) => c.courseId === a.courseId);
    if (deptFilter !== "all" && course?.departmentId !== deptFilter) return false;
    if (courseFilter !== "all" && a.courseId !== courseFilter) return false;
    if (search && !a.title?.toLowerCase().includes(search.toLowerCase()) && !a.courseId?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const deptCourses = deptFilter === "all" ? courses : courses.filter((c) => c.departmentId === deptFilter);
  const stats = {
    total: assessments.length,
    published: assessments.filter((a) => a.marksPublished).length,
    pending: assessments.filter((a) => !a.marksPublished).length,
  };

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2"><ClipboardList size={22} className="text-signal" /> Marks & Results</h1>
            <p className="text-sm text-text-secondary mt-0.5">Approve, publish marks and manage grading.</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={BookOpen} label="Total Assessments" value={stats.total} gradient="bg-ink-fade" sub="All assessments" />
          <StatCard icon={CheckCircle} label="Published" value={stats.published} gradient="bg-gradient-success" sub="Marks released" />
          <StatCard icon={XCircle} label="Pending Review" value={stats.pending} gradient={stats.pending > 0 ? "bg-gradient-warning" : "bg-ink-fade"} sub="Awaiting approval" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="input pl-8 py-2 text-sm" />
          </div>
          <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setCourseFilter("all"); }} className="input w-auto min-w-[150px]">
            <option value="all">All Departments</option>
            {depts.map((d) => <option key={d._id} value={d.departmentId}>{d.name}</option>)}
          </select>
          <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="input w-auto min-w-[180px]">
            <option value="all">All Courses</option>
            {deptCourses.map((c) => <option key={c._id} value={c.courseId}>{c.name} ({c.courseId})</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper border-b border-border">
                  {["Title", "Course", "Type", "Max Marks", "Weight", "Published", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? [1,2,3].map((i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-5 bg-border rounded animate-pulse" /></td></tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted text-sm">No assessments found.</td></tr>
                ) : filtered.map((a) => (
                  <tr key={a._id} className="hover:bg-paper/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-text-primary">{a.title}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{a.courseId}</td>
                    <td className="px-4 py-3"><Badge status={a.type === "exam" ? "present" : a.type === "quiz" ? "od" : "late"}>{a.type}</Badge></td>
                    <td className="px-4 py-3 text-text-secondary">{a.maxMarks}</td>
                    <td className="px-4 py-3 text-text-secondary">{a.weightage ?? 100}%</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-pill ${a.marksPublished ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                        {a.marksPublished ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant={a.marksPublished ? "secondary" : "primary"} onClick={() => togglePublish(a._id, a.marksPublished)}>
                        {a.marksPublished ? "Unpublish" : "Publish"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Marks report summary */}
        <div className="bg-white border border-border rounded-card shadow-card p-5">
          <h2 className="font-display text-base font-semibold text-text-primary mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-signal" /> Marks Overview by Course</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper border-b border-border">
                  {["Course ID", "Course Name", "Assessments", "Avg Marks", "Status"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {courses.filter((c) => deptFilter === "all" || c.departmentId === deptFilter).slice(0, 10).map((c) => {
                  const courseAssessments = assessments.filter((a) => a.courseId === c.courseId);
                  const published = courseAssessments.filter((a) => a.marksPublished).length;
                  return (
                    <tr key={c._id} className="hover:bg-paper/60">
                      <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{c.courseId}</td>
                      <td className="px-4 py-2.5 font-medium text-text-primary">{c.name}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{courseAssessments.length}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{published}/{courseAssessments.length} published</td>
                      <td className="px-4 py-2.5">
                        <Badge status={published === courseAssessments.length && courseAssessments.length > 0 ? "present" : published > 0 ? "late" : "pending"}>
                          {published === courseAssessments.length && courseAssessments.length > 0 ? "Complete" : published > 0 ? "Partial" : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}