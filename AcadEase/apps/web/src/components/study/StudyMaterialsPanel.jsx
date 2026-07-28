import { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, FileText, GraduationCap, PlayCircle, Sparkles, NotebookPen, ClipboardCheck } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";

function getFileUrl(filePath) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/api$/, "")
    : "http://localhost:5000";
  return `${baseUrl}${filePath.startsWith("/") ? "" : "/"}${filePath}`;
}

function toEmbedUrl(url = "") {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
      const videoId = parsed.searchParams.get("v") || parsed.pathname.split("/").pop();
      return `https://www.youtube.com/embed/${videoId}`;
    }
    return url;
  } catch {
    return url;
  }
}

export default function StudyMaterialsPanel({ moduleType = "academic" }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get(`/study-materials?moduleType=${moduleType}`).then((res) => {
      setMaterials(res.data.materials || []);
    }).finally(() => setLoading(false));
  }, [moduleType, user]);

  const grouped = useMemo(() => {
    const groups = {};
    materials.forEach((material) => {
      const key = material.subject || "General";
      if (!groups[key]) groups[key] = { subject: key, items: [] };
      groups[key].items.push(material);
    });
    return Object.values(groups).sort((a, b) => a.subject.localeCompare(b.subject));
  }, [materials]);

  const handleQuizSubmit = () => {
    setSubmitted(true);
  };

  if (loading) return <div className="text-sm text-text-muted">Loading materials…</div>;

  return (
    <div className="space-y-5">
      {moduleType === "tet" && (
        <div className="rounded-card border border-border bg-white p-4 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <NotebookPen size={16} className="text-citrus" />
            <h3 className="font-semibold text-text-primary">Quick note pad</h3>
          </div>
          <textarea
            rows={5}
            value={notes.general || ""}
            onChange={(e) => setNotes((prev) => ({ ...prev, general: e.target.value }))}
            className="input"
            placeholder="Type notes while learning…"
          />
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.subject} className="rounded-card border border-border bg-white p-4 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap size={16} className="text-signal" />
            <h3 className="font-semibold text-text-primary">{group.subject}</h3>
          </div>

          <div className="space-y-3">
            {group.items.filter((m) => m.contentType === "video").map((item) => (
              <div key={item._id} className="rounded-xl border border-border p-3 bg-paper/70">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                    <p className="text-xs text-text-muted">Video module</p>
                  </div>
                  <span className="rounded-full bg-signal/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-signal">Video</span>
                </div>
                {item.videoUrl ? (
                  <div className="mt-3 aspect-video overflow-hidden rounded-lg border border-border">
                    <iframe src={toEmbedUrl(item.videoUrl)} title={item.title} className="h-full w-full" allowFullScreen />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">No video link provided.</p>
                )}
              </div>
            ))}

            {group.items.filter((m) => m.contentType === "text").map((item) => (
              <div key={item._id} className="rounded-xl border border-border p-3 bg-paper/70">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                    <p className="text-xs text-text-muted">Text material</p>
                  </div>
                  <span className="rounded-full bg-citrus/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-citrus">Text</span>
                </div>
                {item.textContent ? <p className="mt-3 whitespace-pre-wrap text-sm text-text-secondary">{item.textContent}</p> : <p className="mt-3 text-sm text-text-muted">No content added.</p>}
              </div>
            ))}

            {group.items.filter((m) => m.contentType === "textbook").map((item) => (
              <div key={item._id} className="rounded-xl border border-border p-3 bg-paper/70">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                    <p className="text-xs text-text-muted">Textbook reference</p>
                  </div>
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-success">Reference</span>
                </div>
                {item.filePath ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={getFileUrl(item.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white hover:bg-ink-light">
                      <Download size={13} /> Download PDF
                    </a>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-text-muted">No file attached.</p>
                )}
              </div>
            ))}

            {group.items.filter((m) => m.contentType === "quiz").map((item) => (
              <div key={item._id} className="rounded-xl border border-border p-3 bg-paper/70">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                    <p className="text-xs text-text-muted">Practice quiz</p>
                  </div>
                  <span className="rounded-full bg-coral/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-coral">Quiz</span>
                </div>
                {item.quizQuestions?.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {item.quizQuestions.map((question, index) => (
                      <div key={question._id || index} className="rounded-lg border border-border p-3">
                        <p className="text-sm font-medium text-text-primary">{index + 1}. {question.question}</p>
                        <div className="mt-2 space-y-2">
                          {question.options?.map((option, optionIndex) => (
                            <label key={`${question._id || index}-${optionIndex}`} className="flex items-center gap-2 text-sm text-text-secondary">
                              <input
                                type="radio"
                                name={`${item._id}-${index}`}
                                checked={answers[`${item._id}-${index}`] === option}
                                onChange={() => setAnswers((prev) => ({ ...prev, [`${item._id}-${index}`]: option }))}
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button onClick={handleQuizSubmit} className="rounded-xl bg-signal px-3 py-2 text-sm font-semibold text-white hover:bg-signal-dark">Submit quiz</button>
                    {submitted && <p className="text-sm text-success">Quiz submitted. Review your answers and continue practicing.</p>}
                  </div>
                )}
              </div>
            ))}

            {group.items.filter((m) => m.contentType === "paper").map((item) => (
              <div key={item._id} className="rounded-xl border border-border p-3 bg-paper/70">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                    <p className="text-xs text-text-muted">Previous year paper</p>
                  </div>
                  <span className="rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-warning">Paper</span>
                </div>
                {item.filePath ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={getFileUrl(item.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white hover:bg-ink-light">
                      <Download size={13} /> Download paper
                    </a>
                    <button onClick={() => setActiveQuiz(item)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-white">
                      <ClipboardCheck size={13} /> Generate quiz
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-text-muted">No paper attached.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {activeQuiz && (
        <div className="rounded-card border border-border bg-white p-4 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-citrus" />
            <h3 className="font-semibold text-text-primary">Quiz from {activeQuiz.title}</h3>
          </div>
          <p className="text-sm text-text-secondary">Timed practice questions have been generated from the uploaded paper.</p>
          <div className="mt-3 rounded-xl border border-border p-3">
            {activeQuiz.quizQuestions?.length > 0 ? activeQuiz.quizQuestions.map((question, index) => (
              <div key={`${activeQuiz._id}-${index}`} className="mb-3">
                <p className="text-sm font-medium text-text-primary">{index + 1}. {question.question}</p>
                <div className="mt-2 space-y-2">
                  {question.options?.map((option, optionIndex) => (
                    <label key={`${activeQuiz._id}-${index}-${optionIndex}`} className="flex items-center gap-2 text-sm text-text-secondary">
                      <input type="radio" name={`active-${index}`} />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            )) : <p className="text-sm text-text-muted">Questions will appear once a paper is processed.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
