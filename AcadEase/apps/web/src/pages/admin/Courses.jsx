import { useEffect, useState } from "react";
import { BookOpen, Plus, X, Pencil, Check, Search, Trash2 } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

export default function AdminCourses() {
  const [courses, setCourses]     = useState([]);
  const [depts, setDepts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [deptFilter, setDeptFilter] = useState("all");
  const [search, setSearch]       = useState("");
  const [showAdd, setShowAdd]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ courseId: "", name: "", departmentId: "", semester: 5, section: "A", facultyId: "", academicYear: "2025-2026" });
  const { toast, showToast, clearToast } = useToast();

  async function load() {
    const [c, d] = await Promise.all([
      api.get("/admin/courses"),
      api.get("/admin/departments"),
    ]);
    setCourses(c.data.courses || []);
    setDepts(d.data.departments || []);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function addCourse(e) {
    e.preventDefault(); setSaving(true);
    try {
      await api.post("/admin/courses", form);
      showToast("Course created.", "success");
      setShowAdd(false);
      setForm({ courseId: "", name: "", departmentId: "", semester: 5, section: "A", facultyId: "", academicYear: "2025-2026" });
      load();
    } catch (ex) { showToast(ex.response?.data?.error || "Failed.", "error"); }
    finally { setSaving(false); }
  }

  async function saveEdit(id) {
    try {
      await api.patch(`/admin/courses/${id}`, editForm);
      showToast("Updated.", "success");
      setEditingId(null);
      load();
    } catch (ex) { showToast(ex.response?.data?.error || "Failed.", "error"); }
  }

  async function deleteCourse(id) {
    if (!confirm("Delete this course?")) return;
    try {
      await api.delete(`/admin/courses/${id}`);
      showToast("Deleted.", "success");
      load();
    } catch { showToast("Delete failed.", "error"); }
  }

  const filtered = courses.filter((c) => {
    if (deptFilter !== "all" && c.departmentId !== deptFilter) return false;
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) && !c.courseId?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function startEdit(c) {
    setEditingId(c._id);
    setEditForm({ courseId: c.courseId, name: c.name, semester: c.semester, section: c.section, facultyId: c.facultyId });
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2"><BookOpen size={22} className="text-signal" /> Course Management</h1>
            <p className="text-sm text-text-secondary mt-0.5">Create and manage courses, subjects & sections.</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-signal text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-signal-dark shadow-card">
            <Plus size={15} /> Add Course
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search course name or ID…" className="input pl-8 py-2 text-sm" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setDeptFilter("all")}
              className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${deptFilter === "all" ? "bg-ink text-white" : "bg-white border border-border text-text-secondary hover:border-ink"}`}>All</button>
            {depts.map((d) => (
              <button key={d._id} onClick={() => setDeptFilter(d.departmentId)}
                className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${deptFilter === d.departmentId ? "bg-ink text-white" : "bg-white border border-border text-text-secondary hover:border-ink"}`}>{d.code || d.departmentId}</button>
            ))}
          </div>
        </div>

        {/* Add form modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-lift w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
                <h2 className="font-display font-bold text-text-primary">Add Course</h2>
                <button onClick={() => setShowAdd(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
              </div>
              <form onSubmit={addCourse} className="px-6 py-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[["courseId","Course ID"],["name","Course Name"],["facultyId","Faculty ID"],["academicYear","Academic Year"]].map(([k,l]) => (
                    <div key={k} className={k === "name" || k === "academicYear" ? "col-span-2" : ""}>
                      <label className="label">{l}</label>
                      <input value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} className="input" required />
                    </div>
                  ))}
                  <div>
                    <label className="label">Department</label>
                    <select value={form.departmentId} onChange={(e) => setForm((p) => ({ ...p, departmentId: e.target.value }))} className="input" required>
                      <option value="">Select</option>
                      {depts.map((d) => <option key={d._id} value={d.departmentId}>{d.name} ({d.departmentId})</option>)}
                    </select>
                  </div>
                  <div><label className="label">Semester</label><input type="number" value={form.semester} onChange={(e) => setForm((p) => ({ ...p, semester: +e.target.value }))} className="input" /></div>
                  <div><label className="label">Section</label><input value={form.section} onChange={(e) => setForm((p) => ({ ...p, section: e.target.value }))} className="input" /></div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:bg-paper">Cancel</button>
                  <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-signal text-white rounded-xl text-sm font-semibold hover:bg-signal-dark disabled:opacity-60">{saving ? "Saving…" : "Create Course"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper border-b border-border">
                  {["Course ID", "Name", "Dept", "Sem", "Section", "Faculty", "Year", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? [1,2,3].map((i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-5 bg-border rounded animate-pulse" /></td></tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-text-muted text-sm">No courses found.</td></tr>
                ) : filtered.map((c) => (
                  <tr key={c._id} className="hover:bg-paper/60 transition-colors">
                    {editingId === c._id ? (
                      <>
                        <td className="px-4 py-2"><input value={editForm.courseId} onChange={(e) => setEditForm((p) => ({ ...p, courseId: e.target.value }))} className="input py-1 text-xs w-20" /></td>
                        <td className="px-4 py-2"><input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="input py-1 text-xs" /></td>
                        <td className="px-4 py-2 text-xs text-text-muted">{c.departmentId}</td>
                        <td className="px-4 py-2"><input type="number" value={editForm.semester} onChange={(e) => setEditForm((p) => ({ ...p, semester: +e.target.value }))} className="input py-1 text-xs w-14" /></td>
                        <td className="px-4 py-2"><input value={editForm.section} onChange={(e) => setEditForm((p) => ({ ...p, section: e.target.value }))} className="input py-1 text-xs w-12" /></td>
                        <td className="px-4 py-2"><input value={editForm.facultyId} onChange={(e) => setEditForm((p) => ({ ...p, facultyId: e.target.value }))} className="input py-1 text-xs w-20" /></td>
                        <td className="px-4 py-2 text-xs text-text-muted">{c.academicYear}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => saveEdit(c._id)} className="w-7 h-7 bg-success/10 text-success rounded-lg flex items-center justify-center hover:bg-success/20"><Check size={12} /></button>
                            <button onClick={() => setEditingId(null)} className="w-7 h-7 bg-border text-text-muted rounded-lg flex items-center justify-center"><X size={12} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{c.courseId}</td>
                        <td className="px-4 py-3 font-medium text-text-primary">{c.name}</td>
                        <td className="px-4 py-3 text-text-secondary text-xs">{c.departmentId}</td>
                        <td className="px-4 py-3 text-text-secondary">{c.semester}</td>
                        <td className="px-4 py-3 text-text-secondary">{c.section}</td>
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{c.facultyId}</td>
                        <td className="px-4 py-3 text-text-secondary text-xs">{c.academicYear}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => startEdit(c)} className="w-7 h-7 bg-signal/10 text-signal rounded-lg flex items-center justify-center hover:bg-signal/20"><Pencil size={12} /></button>
                            <button onClick={() => deleteCourse(c._id)} className="w-7 h-7 bg-danger/10 text-danger rounded-lg flex items-center justify-center hover:bg-danger/20"><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-border bg-paper text-xs text-text-muted">{filtered.length} of {courses.length} courses</div>
        </div>
      </div>
    </AppShell>
  );
}