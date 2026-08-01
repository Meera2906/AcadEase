import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, UserCheck, UserX, ChevronRight, X, Check } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const ROLES = ["all", "student", "faculty", "college_admin", "tnteu_admin"];

function AddUserModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ userId: "", name: "", email: "", password: "Demo@2025", role: "student", departmentId: "CSE_2024", semester: 5, section: "A", batchYear: 2021, enrollmentNumber: "", designation: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setErr("");
    try {
      await api.post("/admin/users", form);
      onSaved();
    } catch (ex) { setErr(ex.response?.data?.error || "Failed"); }
    finally { setSaving(false); }
  }

  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
      <div className="bg-white rounded-card shadow-lift w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="font-display font-bold text-text-primary">Add User</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-3">
          {err && <p className="text-sm text-danger bg-danger/10 rounded-xl px-3 py-2">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            {[["userId","User ID"],["name","Full Name"],["email","Email"],["password","Password"]].map(([k,l]) => (
              <div key={k} className={k === "email" || k === "password" ? "col-span-2" : ""}>
                <label className="label">{l}</label>
                <input type={k === "password" ? "password" : "text"} value={form[k]} onChange={f(k)} className="input" required />
              </div>
            ))}
            <div>
              <label className="label">Role</label>
              <select value={form.role} onChange={f("role")} className="input">
                {["student","faculty","college_admin","tnteu_admin"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Department ID</label>
              <input value={form.departmentId} onChange={f("departmentId")} className="input" />
            </div>
            {form.role === "student" && <>
              <div><label className="label">Semester</label><input type="number" value={form.semester} onChange={f("semester")} className="input" /></div>
              <div><label className="label">Section</label><input value={form.section} onChange={f("section")} className="input" /></div>
              <div><label className="label">Batch Year</label><input type="number" value={form.batchYear} onChange={f("batchYear")} className="input" /></div>
              <div><label className="label">Enrollment No.</label><input value={form.enrollmentNumber} onChange={f("enrollmentNumber")} className="input" /></div>
            </>}
            {(form.role === "faculty" || form.role === "college_admin" || form.role === "tnteu_admin") && (
              <div className="col-span-2"><label className="label">Designation</label><input value={form.designation} onChange={f("designation")} className="input" /></div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:bg-paper">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-signal text-white rounded-xl text-sm font-semibold hover:bg-signal-dark disabled:opacity-60">
              {saving ? "Saving…" : "Add User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers]     = useState([]);
  const [role, setRole]       = useState("all");
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const { toast, showToast, clearToast } = useToast();
  const navigate = useNavigate();

  async function load() {
    const params = role !== "all" ? `?role=${role}` : "";
    const res = await api.get(`/admin/users${params}`);
    setUsers(res.data.users || []);
  }

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [role]);

  async function toggleActive(user) {
    try {
      await api.patch(`/admin/users/${user._id}`, { isActive: !user.isActive });
      showToast(`User ${user.isActive ? "deactivated" : "activated"}.`, "success");
      load();
    } catch { showToast("Failed to update user.", "error"); }
  }

  const filtered = users.filter((u) =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.userId?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); showToast("User added.", "success"); }} />}

      <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">User Management</h1>
            <p className="text-sm text-text-secondary mt-0.5">Add, edit, and manage all users.</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-signal text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-signal-dark transition-colors shadow-card">
            <Plus size={15} /> Add User
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID, email…" className="input pl-8 py-2 text-sm" />
          </div>
          <div className="flex gap-1.5">
            {ROLES.map((r) => (
              <button key={r} onClick={() => setRole(r)}
                className={`px-3 py-1.5 rounded-pill text-xs font-semibold capitalize transition-all ${role === r ? "bg-ink text-white" : "bg-white border border-border text-text-secondary hover:border-ink"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper border-b border-border">
                  {["Name", "User ID", "Email", "Role", "Dept", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  [1,2,3,4,5].map((i) => (
                    <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-5 bg-border rounded animate-pulse" /></td></tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted text-sm">No users found.</td></tr>
                ) : filtered.map((u) => (
                  <tr key={u._id} className="hover:bg-paper/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-signal text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {u.name?.split(" ").slice(0,2).map((w) => w[0]).join("").toUpperCase()}
                        </div>
                        <span className="font-medium text-text-primary">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{u.userId}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{u.email}</td>
                    <td className="px-4 py-3"><Badge status={u.role === "student" ? "present" : u.role === "faculty" ? "od" : "pending"}>{u.role}</Badge></td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{u.departmentId}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-pill ${u.isActive !== false ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                        {u.isActive !== false ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {u.role === "student" && (
                          <button onClick={() => navigate(`/profile/${u.userId}`)} className="text-xs text-signal hover:underline flex items-center gap-0.5">
                            View <ChevronRight size={12} />
                          </button>
                        )}
                        <button onClick={() => toggleActive(u)} title={u.isActive !== false ? "Deactivate" : "Activate"}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${u.isActive !== false ? "bg-danger/10 text-danger hover:bg-danger/20" : "bg-success/10 text-success hover:bg-success/20"}`}>
                          {u.isActive !== false ? <UserX size={13} /> : <UserCheck size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-border bg-paper text-xs text-text-muted">
            {filtered.length} of {users.length} users
          </div>
        </div>
      </div>
    </AppShell>
  );
}
