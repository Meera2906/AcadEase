import { useEffect, useState } from "react";
import { Megaphone, Plus, X, Trash2, Users, GraduationCap, Building2, Globe2 } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

// A circular goes to a set of groups, not one of them — a fee notice usually
// concerns students and the office at once.
const AUDIENCE_OPTIONS = [
  { value: "students", label: "Students", icon: GraduationCap },
  { value: "faculty", label: "Faculty", icon: Users },
  { value: "admins", label: "Admins", icon: Building2 },
];

function audienceLabel(circular) {
  const groups = circular.audiences?.length ? circular.audiences : ["students", "faculty", "admins"];
  if (groups.length === AUDIENCE_OPTIONS.length) return "Everyone";
  return groups.map((g) => AUDIENCE_OPTIONS.find((o) => o.value === g)?.label || g).join(" · ");
}

export default function AdminCirculars() {
  const { user } = useAuth();
  const isTnteu = user?.role === "tnteu_admin";

  const [circulars, setCirculars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audiences: ["students", "faculty", "admins"] });
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  async function load() {
    try {
      const res = await api.get("/admin/circulars", { params: { audience: filter || undefined } });
      setCirculars(res.data.circulars || []);
    } catch { /* pass */ }
  }

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [filter]);

  function toggleAudience(value) {
    setForm((p) => {
      const has = p.audiences.includes(value);
      const next = has ? p.audiences.filter((a) => a !== value) : [...p.audiences, value];
      return { ...p, audiences: next };
    });
  }

  const everyone = form.audiences.length === AUDIENCE_OPTIONS.length;

  async function submit(e) {
    e.preventDefault();
    if (form.audiences.length === 0) return showToast("Pick at least one audience.", "error");
    setSaving(true);
    try {
      const res = await api.post("/admin/circulars", form);
      showToast(res.data.message || "Circular distributed.", "success");
      setShowAdd(false);
      setForm({ title: "", body: "", audiences: ["students", "faculty", "admins"] });
      load();
    } catch (ex) { showToast(ex.response?.data?.error || "Failed.", "error"); }
    finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm("Withdraw this circular?")) return;
    try { await api.delete(`/admin/circulars/${id}`); load(); }
    catch (ex) { showToast(ex.response?.data?.error || "Withdrawal failed.", "error"); }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
              <Megaphone size={22} className="text-citrus" /> Circular Distribution
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {isTnteu
                ? "Issue a circular to every affiliated college at once. Choose any combination of students, faculty and admins."
                : "Send circulars to your students, faculty and office staff. University circulars from TNTEU also appear here."}
            </p>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-signal text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-signal-dark shadow-card">
            <Plus size={15} /> New Circular
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[{ value: "", label: "All circulars" }, ...AUDIENCE_OPTIONS].map((o) => (
            <button
              key={o.value || "all"}
              onClick={() => setFilter(o.value)}
              className={`px-3.5 py-1.5 rounded-pill text-xs font-semibold transition-all ${
                filter === o.value ? "bg-ink text-white" : "bg-white border border-border text-text-secondary"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Compose */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-lift w-full max-w-lg">
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
                <h2 className="font-display font-bold text-text-primary">New Circular</h2>
                <button onClick={() => setShowAdd(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
              </div>
              <form onSubmit={submit} className="px-6 py-5 space-y-4">
                <div>
                  <label className="label">Title</label>
                  <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="input" required />
                </div>
                <div>
                  <label className="label">Circular text</label>
                  <textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} rows={5} className="input" required />
                </div>
                <div>
                  <label className="label">Distribute to</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {AUDIENCE_OPTIONS.map((o) => {
                      const on = form.audiences.includes(o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => toggleAudience(o.value)}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
                            on ? "bg-ink text-white" : "bg-white border border-border text-text-secondary"
                          }`}
                        >
                          <o.icon size={13} /> {o.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, audiences: everyone ? [] : AUDIENCE_OPTIONS.map((o) => o.value) }))}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
                        everyone ? "bg-citrus text-ink" : "bg-white border border-border text-text-secondary"
                      }`}
                    >
                      <Globe2 size={13} /> Everyone
                    </button>
                  </div>
                  <p className="text-xs text-text-muted mt-2">
                    {form.audiences.length === 0
                      ? "Nobody selected — pick at least one group."
                      : `Goes to ${audienceLabel({ audiences: form.audiences }).toLowerCase()}${isTnteu ? " at every affiliated college" : ""}.`}
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:bg-paper">Cancel</button>
                  <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-signal text-white rounded-xl text-sm font-semibold hover:bg-signal-dark disabled:opacity-60">{saving ? "Distributing…" : "Distribute"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Register */}
        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />)}</div>
        ) : circulars.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <Megaphone size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No circulars here yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {circulars.map((c) => (
              <div key={c._id} className="bg-white border border-border rounded-card shadow-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-text-primary">{c.title}</h3>
                      <span className="px-3 py-1 rounded-pill text-xs font-semibold bg-[#E8ECFF] text-signal">
                        {audienceLabel(c)}
                      </span>
                      {c.scope === "university" && (
                        <span className="px-3 py-1 rounded-pill text-xs font-semibold bg-[#FFF3DC] text-warning">
                          TNTEU-wide
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{c.body}</p>
                    <p className="text-xs text-text-muted mt-2">
                      {c.createdByName || c.createdBy} · {new Date(c.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                  {(isTnteu || c.scope !== "university") && (
                    <button onClick={() => remove(c._id)} title="Withdraw" className="w-7 h-7 shrink-0 bg-danger/10 text-danger rounded-lg flex items-center justify-center hover:bg-danger/20">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
