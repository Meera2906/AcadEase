import { useEffect, useState } from "react";
import { Megaphone, Plus, X, Trash2 } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";
import Badge from "../../components/ui/Badge.jsx";

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "students", label: "Students Only" },
  { value: "faculty", label: "Faculty Only" },
];

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all" });
  const [saving, setSaving] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  async function load() {
    try {
      const res = await api.get("/admin/announcements");
      setAnnouncements(res.data.announcements || []);
    } catch { /* pass */ }
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function submit(e) {
    e.preventDefault(); setSaving(true);
    try {
      await api.post("/admin/announcements", form);
      showToast("Announcement sent.", "success");
      setShowAdd(false);
      setForm({ title: "", body: "", audience: "all" });
      load();
    } catch (ex) { showToast(ex.response?.data?.error || "Failed.", "error"); }
    finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm("Delete this announcement?")) return;
    try { await api.delete(`/admin/announcements/${id}`); load(); }
    catch { showToast("Delete failed.", "error"); }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2"><Megaphone size={22} className="text-citrus" /> Announcements</h1>
            <p className="text-sm text-text-secondary mt-0.5">Send notices to students, faculty, or the entire institution.</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-signal text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-signal-dark shadow-card">
            <Plus size={15} /> New Announcement
          </button>
        </div>

        {/* Add modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-lift w-full max-w-lg">
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
                <h2 className="font-display font-bold text-text-primary">New Announcement</h2>
                <button onClick={() => setShowAdd(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
              </div>
              <form onSubmit={submit} className="px-6 py-5 space-y-4">
                <div>
                  <label className="label">Title</label>
                  <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="input" required />
                </div>
                <div>
                  <label className="label">Message</label>
                  <textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} rows={4} className="input" required />
                </div>
                <div>
                  <label className="label">Audience</label>
                  <div className="flex gap-2 mt-1">
                    {AUDIENCE_OPTIONS.map((o) => (
                      <button key={o.value} type="button" onClick={() => setForm((p) => ({ ...p, audience: o.value }))}
                        className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${form.audience === o.value ? "bg-ink text-white" : "bg-white border border-border text-text-secondary"}`}>{o.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:bg-paper">Cancel</button>
                  <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-signal text-white rounded-xl text-sm font-semibold hover:bg-signal-dark disabled:opacity-60">{saving ? "Sending…" : "Send Announcement"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Announcements list */}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />)}</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <Megaphone size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No announcements yet. Create your first one!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="bg-white border border-border rounded-card shadow-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-text-primary">{a.title}</h3>
                      <Badge status={a.audience === "all" ? "active" : a.audience === "students" ? "present" : "od"}>
                        {a.audience === "all" ? "Everyone" : a.audience === "students" ? "Students" : "Faculty"}
                      </Badge>
                    </div>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-text-muted mt-2">
                      {a.createdBy} · {new Date(a.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <button onClick={() => remove(a.id)} className="w-7 h-7 shrink-0 bg-danger/10 text-danger rounded-lg flex items-center justify-center hover:bg-danger/20"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}