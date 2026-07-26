import { useEffect, useState } from "react";
import { Plus, Building2, X, Pencil, Check } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

function DeptRow({ dept, onSave }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: dept.name, code: dept.code, hodId: dept.hodId || "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try { await api.patch(`/admin/departments/${dept._id}`, form); onSave(); setEditing(false); }
    finally { setSaving(false); }
  }

  if (editing) {
    return (
      <tr className="bg-signal/5">
        <td className="px-4 py-3"><input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="input py-1.5 text-sm" /></td>
        <td className="px-4 py-3 font-mono text-xs text-text-muted">{dept.departmentId}</td>
        <td className="px-4 py-3"><input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} className="input py-1.5 text-sm w-20" /></td>
        <td className="px-4 py-3"><input value={form.hodId} onChange={(e) => setForm((p) => ({ ...p, hodId: e.target.value }))} placeholder="HOD User ID" className="input py-1.5 text-sm" /></td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="w-7 h-7 bg-success/10 text-success rounded-lg flex items-center justify-center hover:bg-success/20"><Check size={13} /></button>
            <button onClick={() => setEditing(false)} className="w-7 h-7 bg-border text-text-muted rounded-lg flex items-center justify-center hover:bg-paper"><X size={13} /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-paper/60 transition-colors">
      <td className="px-4 py-3 font-medium text-text-primary">{dept.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-text-muted">{dept.departmentId}</td>
      <td className="px-4 py-3 text-text-secondary">{dept.code}</td>
      <td className="px-4 py-3 text-text-secondary font-mono text-xs">{dept.hodId || "—"}</td>
      <td className="px-4 py-3">
        <button onClick={() => setEditing(true)} className="w-7 h-7 bg-signal/10 text-signal rounded-lg flex items-center justify-center hover:bg-signal/20"><Pencil size={13} /></button>
      </td>
    </tr>
  );
}

export default function AdminDepartments() {
  const [depts, setDepts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]     = useState({ departmentId: "", name: "", code: "", hodId: "" });
  const [saving, setSaving] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  async function load() { const r = await api.get("/admin/departments"); setDepts(r.data.departments || []); }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function addDept(e) {
    e.preventDefault(); setSaving(true);
    try { await api.post("/admin/departments", form); showToast("Department created.", "success"); setShowAdd(false); setForm({ departmentId: "", name: "", code: "", hodId: "" }); load(); }
    catch (ex) { showToast(ex.response?.data?.error || "Failed.", "error"); }
    finally { setSaving(false); }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2"><Building2 size={22} className="text-signal" /> Departments</h1>
            <p className="text-sm text-text-secondary mt-0.5">Manage departments and assign HODs.</p>
          </div>
          <button onClick={() => setShowAdd((o) => !o)} className="flex items-center gap-2 bg-signal text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-signal-dark shadow-card">
            <Plus size={15} /> Add Department
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addDept} className="bg-white border border-signal/20 rounded-card p-5 shadow-card grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[["departmentId","Dept ID"],["name","Name"],["code","Code"],["hodId","HOD User ID (opt.)"]].map(([k,l]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} className="input" required={k !== "hodId"} />
              </div>
            ))}
            <div className="col-span-2 sm:col-span-4 flex gap-3">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-signal text-white rounded-xl text-sm font-semibold hover:bg-signal-dark disabled:opacity-60">{saving ? "Saving…" : "Create"}</button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:bg-paper">Cancel</button>
            </div>
          </form>
        )}

        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper border-b border-border">
                {["Department Name","ID","Code","HOD",""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? [1,2,3].map((i) => <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-5 bg-border rounded animate-pulse" /></td></tr>)
                : depts.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted text-sm">No departments yet.</td></tr>
                : depts.map((d) => <DeptRow key={d._id} dept={d} onSave={() => { load(); showToast("Saved.", "success"); }} />)}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
