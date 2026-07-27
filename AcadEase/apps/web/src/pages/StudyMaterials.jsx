import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Download, FileText, ImageIcon, Plus, Trash2, GraduationCap, Sparkles } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import Toast, { useToast } from "../components/ui/Toast.jsx";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

function getFileUrl(filePath) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/api$/, "")
    : "http://localhost:5000";
  return `${baseUrl}${filePath.startsWith("/") ? "" : "/"}${filePath}`;
}

function getPreviewType(fileName = "") {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  return "download";
}

export default function StudyMaterialsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast, showToast, clearToast } = useToast();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "general", audience: "all" });
  const [file, setFile] = useState(null);

  async function loadMaterials() {
    try {
      const res = await api.get("/study-materials");
      setMaterials(res.data.materials || []);
    } catch {
      setMaterials([]);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadMaterials().finally(() => setLoading(false));
  }, [user]);

  const tetMaterials = useMemo(() => materials.filter((m) => m.category === "tet"), [materials]);
  const generalMaterials = useMemo(() => materials.filter((m) => m.category !== "tet"), [materials]);
  const canManage = user?.role === "admin" || user?.role === "superadmin" || user?.role === "faculty";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !form.title) {
      showToast("Please add a title and choose a file", "error");
      return;
    }

    setSaving(true);
    const data = new FormData();
    data.append("file", file);
    data.append("title", form.title);
    data.append("description", form.description);
    data.append("category", form.category);
    data.append("audience", form.audience);

    try {
      await api.post("/study-materials", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      showToast("Study material uploaded", "success");
      setShowForm(false);
      setForm({ title: "", description: "", category: "general", audience: "all" });
      setFile(null);
      await loadMaterials();
    } catch (err) {
      showToast(err.response?.data?.error || "Upload failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this study material?")) return;
    try {
      await api.delete(`/study-materials/${id}`);
      showToast("Material removed", "success");
      await loadMaterials();
    } catch {
      showToast("Unable to remove material", "error");
    }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />
      <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
              <BookOpen size={22} className="text-citrus" /> Study Materials
            </h1>
            <p className="text-sm text-text-secondary mt-1">View, download, and preview shared resources for your courses and TET preparation.</p>
          </div>
          {canManage && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:bg-signal-dark"
            >
              <Plus size={15} /> Upload material
            </button>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <div className="rounded-card border border-border bg-white p-4 shadow-card">
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap size={17} className="text-signal" />
                <h2 className="text-sm font-semibold text-text-primary">TET Exam Preparation</h2>
              </div>
              {tetMaterials.length === 0 ? (
                <p className="text-sm text-text-muted">No TET preparation materials shared yet.</p>
              ) : (
                <div className="space-y-2">
                  {tetMaterials.map((material) => (
                    <MaterialCard key={material._id} material={material} canManage={canManage} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-card border border-border bg-white p-4 shadow-card">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={17} className="text-citrus" />
                <h2 className="text-sm font-semibold text-text-primary">Course Materials</h2>
              </div>
              {generalMaterials.length === 0 ? (
                <p className="text-sm text-text-muted">No study materials are available at the moment.</p>
              ) : (
                <div className="space-y-2">
                  {generalMaterials.map((material) => (
                    <MaterialCard key={material._id} material={material} canManage={canManage} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-card border border-border bg-white p-4 shadow-card h-fit">
            <h2 className="text-sm font-semibold text-text-primary">How it works</h2>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li>• Faculty and admins can upload PDFs, images, and documents.</li>
              <li>• Students can preview PDFs and images directly inside the portal.</li>
              <li>• TET prep resources are grouped in a dedicated section.</li>
            </ul>
            <button
              onClick={() => navigate(user?.role === "student" ? "/student/dashboard" : "/admin/dashboard")}
              className="mt-4 w-full rounded-xl border border-border px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-paper"
            >
              Back to dashboard
            </button>
          </div>
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-card bg-white shadow-lift">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="font-display text-lg font-bold text-text-primary">Upload study material</h2>
                <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
                <div>
                  <label className="label">Title</label>
                  <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="input" required />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="input" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Category</label>
                    <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="input">
                      <option value="general">General</option>
                      <option value="tet">TET Prep</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Audience</label>
                    <select value={form.audience} onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value }))} className="input">
                      <option value="all">Everyone</option>
                      <option value="students">Students</option>
                      <option value="faculty">Faculty</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">File</label>
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-text-secondary" required />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-paper">Cancel</button>
                  <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-white hover:bg-signal-dark disabled:opacity-60">
                    {saving ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MaterialCard({ material, canManage, onDelete }) {
  const previewType = getPreviewType(material.fileName || "");
  const fileUrl = getFileUrl(material.filePath);

  return (
    <div className="rounded-xl border border-border bg-paper/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {material.category === "tet" ? <GraduationCap size={14} className="text-citrus" /> : <FileText size={14} className="text-signal" />}
            <p className="text-sm font-semibold text-text-primary truncate">{material.title}</p>
          </div>
          {material.description && <p className="mt-1 text-xs text-text-secondary">{material.description}</p>}
          <p className="mt-2 text-[11px] text-text-muted">
            {material.fileName} · {material.category === "tet" ? "TET Prep" : "General"}
          </p>
        </div>
        {canManage && (
          <button onClick={() => onDelete(material._id)} className="shrink-0 rounded-lg bg-danger/10 p-2 text-danger hover:bg-danger/20">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white hover:bg-ink-light">
          <Download size={13} /> Download
        </a>
        {previewType === "pdf" && (
          <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-white">
            View PDF
          </a>
        )}
        {previewType === "image" && (
          <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-white">
            <ImageIcon size={13} /> Open image
          </a>
        )}
      </div>
    </div>
  );
}
