import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Plus, GraduationCap, Sparkles, NotebookPen, FileText, Video, ClipboardCheck } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import Toast, { useToast } from "../components/ui/Toast.jsx";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import StudyMaterialsPanel from "../components/study/StudyMaterialsPanel.jsx";
import PyqPracticePanel from "../components/study/PyqPracticePanel.jsx";

export default function StudyMaterialsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, showToast, clearToast } = useToast();
  const [activeTab, setActiveTab] = useState("academic");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    moduleType: "academic",
    subject: "English",
    contentType: "text",
    audience: "students",
    videoUrl: "",
    textContent: "",
    quizQuestions: "",
    timeLimitMinutes: "0",
  });
  const [file, setFile] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    if (tabParam === "tet") setActiveTab("tet");
    else if (tabParam === "pyq") setActiveTab("pyq");
    else setActiveTab("academic");
  }, [location.search]);

  const canManage = user?.role === "admin" || user?.role === "superadmin" || user?.role === "faculty";

  function openUploadForm() {
    const tetDefaults = {
      title: "Syllabus & Pattern",
      description: "TET preparation syllabus and pattern guide",
      moduleType: "tet",
      subject: "General",
      contentType: "text",
      audience: "students",
      videoUrl: "",
      textContent: "Child Development & Pedagogy\nLanguage I & II\nMathematics & Environmental Studies\nPractice-based questions with answer review",
      quizQuestions: "",
      timeLimitMinutes: "0",
    };

    setShowForm(true);
    setFile(null);
    setForm(activeTab === "tet" ? tetDefaults : {
      title: "",
      description: "",
      moduleType: activeTab === "tet" ? "tet" : "academic",
      subject: "English",
      contentType: "text",
      audience: "students",
      videoUrl: "",
      textContent: "",
      quizQuestions: "",
      timeLimitMinutes: "0",
    });
  }

  function openPreview(item) {
    if (!item?.filePath) return;
    const baseUrl = import.meta.env.VITE_API_BASE_URL
      ? import.meta.env.VITE_API_BASE_URL.replace(/\/api$/, "")
      : "http://localhost:5000";
    const fileUrl = `${baseUrl}${item.filePath.startsWith("/") ? "" : "/"}${item.filePath}`;
    setPreviewItem(item);
    setPreviewUrl(fileUrl);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title) {
      showToast("Please add a title", "error");
      return;
    }

    setSaving(true);
    const data = new FormData();
    if (file) data.append("file", file);
    Object.entries(form).forEach(([key, value]) => data.append(key, value));

    try {
      await api.post("/study-materials", data, { headers: { "Content-Type": "multipart/form-data" } });
      showToast("Material saved", "success");
      setShowForm(false);
      setForm({ title: "", description: "", moduleType: activeTab === "tet" ? "tet" : "academic", subject: "English", contentType: "text", audience: "students", videoUrl: "", textContent: "", quizQuestions: "", timeLimitMinutes: "0" });
      setFile(null);
    } catch (err) {
      showToast(err.response?.data?.error || "Upload failed", "error");
    } finally {
      setSaving(false);
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
            <p className="text-sm text-text-secondary mt-1">Academic modules and TET preparation resources in one place.</p>
          </div>
          {canManage && (
            <button onClick={openUploadForm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:bg-signal-dark">
              <Plus size={15} /> Upload content
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveTab("academic")} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === "academic" ? "bg-ink text-white" : "bg-white border border-border text-text-secondary"}`}>
            <span className="inline-flex items-center gap-2"><GraduationCap size={15} /> Academic Modules</span>
          </button>
          <button onClick={() => setActiveTab("tet")} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === "tet" ? "bg-ink text-white" : "bg-white border border-border text-text-secondary"}`}>
            <span className="inline-flex items-center gap-2"><Sparkles size={15} /> TET Preparation</span>
          </button>
          <button onClick={() => setActiveTab("pyq")} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === "pyq" ? "bg-ink text-white" : "bg-white border border-border text-text-secondary"}`}>
            <span className="inline-flex items-center gap-2"><FileText size={15} /> PYQ Practice</span>
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <div>
            {activeTab === "academic" ? (
              <StudyMaterialsPanel moduleType="academic" onMaterialsLoaded={setMaterials} onPreviewRequest={openPreview} />
            ) : activeTab === "tet" ? (
              <StudyMaterialsPanel moduleType="tet" onMaterialsLoaded={setMaterials} onPreviewRequest={openPreview} />
            ) : (
              <PyqPracticePanel />
            )}
          </div>
          <div className="space-y-4">
            <div className="rounded-card border border-border bg-white p-4 shadow-card">
              <h2 className="text-sm font-semibold text-text-primary">{activeTab === "academic" ? "Academic learning flow" : "TET prep experience"}</h2>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                {activeTab === "academic" ? (
                  <>
                    <li><span className="font-semibold text-text-primary">• Subjects</span> are grouped with video modules, texts, and textbook references.</li>
                    <li><span className="font-semibold text-text-primary">• Video content</span> opens directly inside the portal when links are provided.</li>
                    <li><span className="font-semibold text-text-primary">• PDFs and textbook references</span> are downloadable.</li>
                  </>
                ) : (
                  <>
                    <li><span className="font-semibold text-text-primary">• Textbooks</span> and previous year papers are available for download.</li>
                    <li><span className="font-semibold text-text-primary">• Video lessons</span> play from YouTube links.</li>
                    <li><span className="font-semibold text-text-primary">• Practice quizzes</span> can be generated from uploaded papers.</li>
                  </>
                )}
              </ul>
            </div>
            <div className="rounded-card border border-border bg-white p-4 shadow-card">
              <h2 className="text-sm font-semibold text-text-primary">Syllabus & Pattern</h2>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                <li>• Child Development & Pedagogy</li>
                <li>• Language I & II</li>
                <li>• Mathematics & Environmental Studies</li>
                <li>• Practice-based questions with answer review</li>
              </ul>
            </div>
            <div className="rounded-card border border-border bg-white p-4 shadow-card">
              <h2 className="text-sm font-semibold text-text-primary">Recommended resources</h2>
              <div className="mt-3 space-y-2 text-sm text-text-secondary">
                <p><span className="font-semibold text-text-primary">Standard Books:</span> Use state board or NCERT/SCERT school textbooks for core concepts.</p>
                <p><span className="font-semibold text-text-primary">Pedagogy Guides:</span> Use child psychology, teaching methods, and classroom management guides for better preparation.</p>
              </div>
            </div>
            <div className="rounded-card border border-border bg-white p-4 shadow-card">
              <h2 className="text-sm font-semibold text-text-primary">Quick links</h2>
              <div className="mt-3 space-y-2 text-sm text-text-secondary">
                {materials.filter((item) => item.filePath).slice(0, 4).map((item) => (
                  <button key={item._id} onClick={() => openPreview(item)} className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left hover:bg-paper">
                    <span>{item.title}</span>
                    <span className="text-xs text-signal">Preview</span>
                  </button>
                ))}
                {materials.filter((item) => item.filePath).length === 0 && (
                  <p className="text-sm text-text-muted">Upload a PDF or image resource to make quick preview links appear here.</p>
                )}
              </div>
            </div>
            <button onClick={() => navigate(user?.role === "student" ? "/student/dashboard" : user?.role === "faculty" ? "/faculty/dashboard" : "/admin/dashboard")} className="w-full rounded-xl border border-border px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-paper">
              Back to dashboard
            </button>
          </div>
        </div>

        {previewItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4" onClick={() => setPreviewItem(null)}>
            <div className="w-full max-w-5xl rounded-card bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="font-semibold text-text-primary">{previewItem.title}</h3>
                <button onClick={() => setPreviewItem(null)} className="text-text-muted hover:text-text-primary">✕</button>
              </div>
              <iframe src={previewUrl} title={previewItem.title} className="h-[75vh] w-full rounded-b-card" />
            </div>
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-card bg-white shadow-lift">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="font-display text-lg font-bold text-text-primary">Create learning module</h2>
                <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Title</label>
                    <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="input" required />
                  </div>
                  <div>
                    <label className="label">Module</label>
                    <select value={form.moduleType} onChange={(e) => setForm((p) => ({ ...p, moduleType: e.target.value }))} className="input">
                      <option value="academic">Academic</option>
                      <option value="tet">TET</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Subject</label>
                    <input value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} className="input" />
                  </div>
                  <div>
                    <label className="label">Content type</label>
                    <select value={form.contentType} onChange={(e) => setForm((p) => ({ ...p, contentType: e.target.value }))} className="input">
                      <option value="text">Text material</option>
                      <option value="video">Video module</option>
                      <option value="textbook">Textbook reference</option>
                      <option value="quiz">Quiz</option>
                      <option value="paper">Previous year paper</option>
                      <option value="note">Note</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Audience</label>
                    <select value={form.audience} onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value }))} className="input">
                      <option value="students">Students</option>
                      <option value="faculty">Faculty</option>
                      <option value="all">Everyone</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Time limit (mins)</label>
                    <input type="number" value={form.timeLimitMinutes} onChange={(e) => setForm((p) => ({ ...p, timeLimitMinutes: e.target.value }))} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="input" />
                </div>
                {(form.contentType === "video") && (
                  <div>
                    <label className="label">YouTube video link</label>
                    <input value={form.videoUrl} onChange={(e) => setForm((p) => ({ ...p, videoUrl: e.target.value }))} className="input" placeholder="https://www.youtube.com/watch?v=..." />
                  </div>
                )}
                {(form.contentType === "text" || form.contentType === "note") && (
                  <div>
                    <label className="label">Text content</label>
                    <textarea value={form.textContent} onChange={(e) => setForm((p) => ({ ...p, textContent: e.target.value }))} rows={5} className="input" />
                  </div>
                )}
                {(form.contentType === "quiz" || form.contentType === "paper") && (
                  <div>
                    <label className="label">Quiz questions (JSON array) or paper text</label>
                    <textarea value={form.quizQuestions} onChange={(e) => setForm((p) => ({ ...p, quizQuestions: e.target.value }))} rows={4} className="input" placeholder='[{"question":"...", "options":["A","B","C","D"], "correctAnswer":"A"}]' />
                  </div>
                )}
                <div>
                  <label className="label">Upload file (optional)</label>
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-text-secondary" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-paper">Cancel</button>
                  <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-white hover:bg-signal-dark disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
