import { useEffect, useState } from "react";
import {
  ClipboardList, Search, CheckCircle, XCircle, TrendingUp, BookOpen,
  GraduationCap, Eye, Send, AlertTriangle, Users, XOctagon,
} from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const GRADE_COLORS = {
  O:   "bg-success text-white",
  "A+":"bg-success/80 text-white",
  A:   "bg-teal text-white",
  "B+":"bg-signal/80 text-white",
  B:   "bg-signal/60 text-white",
  C:   "bg-warning text-white",
  U:   "bg-danger text-white",
};

export default function AdminMarks() {
  const [assessments, setAssessments] = useState([]);
  const [courses, setCourses]         = useState([]);
  const [depts, setDepts]             = useState([]);
  const [deptFilter, setDeptFilter]   = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const { toast, showToast, clearToast } = useToast();

  // Semester result bulk section state
  const [semFilter, setSemFilter]   = useState({ semester: "", academicYear: "2024-2025", departmentId: "" });
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewRows, setPreviewRows] = useState(null);

  // Pending review state
  const [pendingResults, setPendingResults] = useState([]);
  const [rejectTarget, setRejectTarget]     = useState(null); // { studentId, semester, academicYear }
  const [rejectNote, setRejectNote]         = useState("");
  const [rejecting, setRejecting]           = useState(false);

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

  async function loadPending() {
    try {
      const res = await api.get("/results/pending-review");
      setPendingResults(res.data.results || []);
    } catch { /* non-fatal */ }
  }

  useEffect(() => { load().finally(() => setLoading(false)); loadPending(); }, []);

  async function togglePublish(assessmentId, current) {
    try {
      await api.patch(`/assessments/${assessmentId}/publish`, { marksPublished: !current });
      showToast(`Marks ${current ? "unpublished" : "published"}.`, "success");
      load();
    } catch (ex) { showToast(ex.response?.data?.error || "Failed.", "error"); }
  }

  async function handlePreview() {
    if (!semFilter.semester || !semFilter.academicYear) {
      showToast("Enter semester and academic year.", "error"); return;
    }
    setPreviewing(true);
    setPreviewRows(null);
    try {
      const params = new URLSearchParams({ semester: semFilter.semester, academicYear: semFilter.academicYear });
      if (semFilter.departmentId) params.append("departmentId", semFilter.departmentId);
      const res = await api.get(`/results/semester/preview?${params}`);
      setPreviewRows(res.data.rows || []);
      if (!res.data.rows?.length) showToast("No students found for this semester.", "info");
    } catch (ex) {
      showToast(ex.response?.data?.error || "Preview failed.", "error");
    } finally {
      setPreviewing(false);
    }
  }

  async function handlePublishAll() {
    if (!previewRows?.length) return;
    setPublishing(true);
    try {
      const body = { semester: semFilter.semester, academicYear: semFilter.academicYear };
      if (semFilter.departmentId) body.departmentId = semFilter.departmentId;
      const res = await api.post("/results/semester/publish-all", body);
      const { published, failed } = res.data;
      if (failed?.length) {
        showToast(`Published ${published}, ${failed.length} failed. Check console.`, "error");
      } else {
        showToast(`✓ Results published for all ${published} students. Emails & SMS sent!`, "success");
      }
      setPreviewRows(null);
    } catch (ex) {
      showToast(ex.response?.data?.error || "Publish failed.", "error");
    } finally {
      setPublishing(false);
    }
  }

  async function handleReject(e) {
    e.preventDefault();
    if (!rejectNote.trim()) return;
    setRejecting(true);
    try {
      await api.post(`/results/semester/${rejectTarget.studentId}/reject`, {
        semester: rejectTarget.semester,
        academicYear: rejectTarget.academicYear,
        rejectionNote: rejectNote.trim(),
      });
      showToast("Result rejected. Faculty has been notified.", "success");
      setRejectTarget(null);
      setRejectNote("");
      loadPending();
    } catch (ex) {
      showToast(ex.response?.data?.error || "Failed to reject.", "error");
    } finally {
      setRejecting(false);
    }
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
    total:     assessments.length,
    published: assessments.filter((a) => a.marksPublished).length,
    pending:   assessments.filter((a) => !a.marksPublished).length,
  };

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      <div className="p-4 md:p-6 space-y-6 bg-paper min-h-screen">

        {/* ── Page header ── */}
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
            <ClipboardList size={22} className="text-signal" /> Marks &amp; Results
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">Approve, publish marks and manage semester results.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={BookOpen}    label="Total Assessments" value={stats.total}     gradient="bg-ink-fade"           sub="All assessments" />
          <StatCard icon={CheckCircle} label="Published"          value={stats.published} gradient="bg-gradient-success"   sub="Marks released" />
          <StatCard icon={XCircle}     label="Pending Review"     value={stats.pending}   gradient={stats.pending > 0 ? "bg-gradient-warning" : "bg-ink-fade"} sub="Awaiting approval" />
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

        {/* Assessments Table */}
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

        {/* ── Pending Review Section ── */}
        {pendingResults.length > 0 && (
          <div className="bg-white border border-danger/30 rounded-card shadow-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-danger" />
              <h2 className="font-display text-base font-semibold text-text-primary">Results Pending Review</h2>
              <span className="ml-1 text-xs font-bold bg-danger/10 text-danger px-2 py-0.5 rounded-pill">{pendingResults.length}</span>
            </div>
            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-paper border-b border-border">
                    {["Student ID", "Semester", "Academic Year", "Submitted By", "Status", "Rejection Note", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendingResults.map((r) => (
                    <tr key={`${r.studentId}-${r.semester}-${r.academicYear}`} className="hover:bg-paper/40">
                      <td className="px-4 py-3 font-mono text-xs text-text-primary">{r.studentId}</td>
                      <td className="px-4 py-3 text-text-secondary">Sem {r.semester}</td>
                      <td className="px-4 py-3 text-text-secondary">{r.academicYear}</td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">{r.enteredBy}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-pill ${
                          r.status === "pending_review" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"
                        }`}>
                          {r.status === "pending_review" ? "Pending Review" : "Rejected"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted max-w-[200px] truncate">
                        {r.rejectionNote || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "pending_review" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                setRejectTarget({ studentId: r.studentId, semester: r.semester, academicYear: r.academicYear });
                                setRejectNote("");
                              }}
                              className="flex items-center gap-1 bg-danger hover:bg-danger/90 text-white"
                            >
                              <XOctagon size={12} /> Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await api.post(`/results/semester/${r.studentId}/publish`, {
                                    semester: r.semester,
                                    academicYear: r.academicYear,
                                  });
                                  showToast("Result approved and published.", "success");
                                  loadPending();
                                } catch (ex) {
                                  showToast(ex.response?.data?.error || "Failed.", "error");
                                }
                              }}
                            >
                              Approve &amp; Publish
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Semester Result Publisher ── */}
        <div className="bg-white border border-border rounded-card shadow-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <GraduationCap size={20} className="text-signal" />
            <h2 className="font-display text-base font-semibold text-text-primary">Publish Semester Results</h2>
          </div>
          <p className="text-sm text-text-muted -mt-2">
            Preview all students' aggregated marks, then publish in one click — PDFs generated &amp; sent to all students via email and parents via SMS.
          </p>

          {/* Filter bar */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[100px] max-w-[120px]">
              <label className="label">Semester</label>
              <input
                type="number" min="1" max="8"
                value={semFilter.semester}
                onChange={(e) => setSemFilter((p) => ({ ...p, semester: e.target.value }))}
                className="input" placeholder="e.g. 5"
              />
            </div>
            <div className="flex-1 min-w-[130px] max-w-[160px]">
              <label className="label">Academic Year</label>
              <input
                value={semFilter.academicYear}
                onChange={(e) => setSemFilter((p) => ({ ...p, academicYear: e.target.value }))}
                className="input" placeholder="2024-2025"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="label">Department (optional)</label>
              <select
                value={semFilter.departmentId}
                onChange={(e) => setSemFilter((p) => ({ ...p, departmentId: e.target.value }))}
                className="input"
              >
                <option value="">All Departments</option>
                {depts.map((d) => <option key={d._id} value={d.departmentId}>{d.name}</option>)}
              </select>
            </div>
            <Button onClick={handlePreview} disabled={previewing} className="flex items-center gap-2">
              <Eye size={14} /> {previewing ? "Loading…" : "Preview Results"}
            </Button>
          </div>

          {/* Preview Table */}
          {previewRows !== null && (
            <div className="space-y-4">
              {previewRows.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">No students found for this semester.</p>
              ) : (
                <>
                  {/* Summary bar */}
                  <div className="flex flex-wrap items-center gap-4 bg-paper border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Users size={15} className="text-text-muted" />
                      <span className="text-sm font-semibold text-text-primary">{previewRows.length} students</span>
                    </div>
                    <span className="text-success text-sm font-semibold">
                      ✓ {previewRows.filter((r) => r.overallResult === "pass").length} Pass
                    </span>
                    <span className="text-danger text-sm font-semibold">
                      ✗ {previewRows.filter((r) => r.overallResult === "fail").length} Fail / Arrears
                    </span>
                    <div className="flex-1" />
                    <Button
                      onClick={handlePublishAll}
                      disabled={publishing}
                      className="flex items-center gap-2 bg-success hover:bg-success/90"
                    >
                      <Send size={14} />
                      {publishing ? "Publishing…" : `Publish All & Notify (${previewRows.length})`}
                    </Button>
                  </div>

                  {/* Warning banner */}
                  <div className="flex items-start gap-2 bg-warning/8 border border-warning/30 rounded-xl px-4 py-3">
                    <AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning font-medium">
                      Publishing will generate a result PDF for each student, send email notifications, and SMS to parents. This action cannot be undone.
                    </p>
                  </div>

                  {/* Student results table */}
                  <div className="overflow-x-auto border border-border rounded-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-paper border-b border-border">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">#</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Student</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Reg No.</th>
                          {previewRows[0]?.subjects.map((s) => (
                            <th key={s.courseId} className="text-center px-3 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap">
                              {s.courseId}
                            </th>
                          ))}
                          <th className="text-center px-3 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">GPA</th>
                          <th className="text-center px-3 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {previewRows.map((row, i) => (
                          <tr key={row.studentId} className="hover:bg-paper/40 transition-colors">
                            <td className="px-4 py-3 text-xs text-text-muted tabular-nums">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-text-primary">{row.name}</td>
                            <td className="px-4 py-3 font-mono text-xs text-text-muted">{row.enrollmentNumber}</td>
                            {row.subjects.map((s) => (
                              <td key={s.courseId} className="px-3 py-3 text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-xs font-bold tabular-nums text-text-primary">{s.marksObtained}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-pill ${GRADE_COLORS[s.grade] || "bg-paper text-text-muted"}`}>
                                    {s.grade}
                                  </span>
                                </div>
                              </td>
                            ))}
                            <td className="px-3 py-3 text-center">
                              <span className="text-sm font-bold tabular-nums text-text-primary">{row.gpa}</span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              {row.overallResult === "pass" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-success bg-success/10 px-2 py-0.5 rounded-pill">
                                  <CheckCircle size={11} /> Pass
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-pill">
                                  <XCircle size={11} /> Fail
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Marks overview by course */}
        <div className="bg-white border border-border rounded-card shadow-card p-5">
          <h2 className="font-display text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-signal" /> Marks Overview by Course
          </h2>
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

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-card shadow-lift w-full max-w-md p-6">
            <h2 className="font-display text-lg font-bold text-text-primary mb-1 flex items-center gap-2">
              <XOctagon size={18} className="text-danger" /> Reject Result
            </h2>
            <p className="text-sm text-text-muted mb-4">
              Rejecting <span className="font-mono font-semibold text-text-primary">{rejectTarget.studentId}</span> — Sem {rejectTarget.semester} ({rejectTarget.academicYear}).
              The faculty will be notified with your reason.
            </p>
            <form onSubmit={handleReject} className="space-y-4">
              <div>
                <label className="label">Reason for Rejection</label>
                <textarea
                  required
                  rows={3}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  className="input w-full resize-none"
                  placeholder="e.g. Marks for CS303 appear incorrect — please re-check and resubmit."
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={rejecting || !rejectNote.trim()} className="flex-1 bg-danger hover:bg-danger/90 text-white">
                  {rejecting ? "Rejecting…" : "Reject & Notify Faculty"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setRejectTarget(null); setRejectNote(""); }}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

