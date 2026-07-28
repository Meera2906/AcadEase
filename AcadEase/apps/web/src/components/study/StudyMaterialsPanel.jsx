import { useEffect, useMemo, useState } from "react";
import { Download, GraduationCap, Sparkles, NotebookPen, ClipboardCheck, Grip, Calculator } from "lucide-react";
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

export default function StudyMaterialsPanel({ moduleType = "academic", onMaterialsLoaded, onPreviewRequest }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showNotePad, setShowNotePad] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [notePos, setNotePos] = useState({ x: 24, y: 24 });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!user) return;
    api.get(`/study-materials?moduleType=${moduleType}`).then((res) => {
      const nextMaterials = res.data.materials || [];
      setMaterials(nextMaterials);
      onMaterialsLoaded?.(nextMaterials);
    }).finally(() => setLoading(false));
  }, [moduleType, user, onMaterialsLoaded]);

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

  const startDrag = (e) => {
    setDragging(true);
    setDragOffset({ x: e.clientX - notePos.x, y: e.clientY - notePos.y });
  };

  const onDrag = (e) => {
    if (!dragging) return;
    setNotePos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
  };

  const stopDrag = () => setDragging(false);

  const handleCalculatorButton = (value) => {
    if (value === "C") {
      setCalcDisplay("0");
      return;
    }
    if (value === "=") {
      try {
        const next = Function(`"use strict";return (${calcDisplay})`)();
        setCalcDisplay(String(next));
      } catch {
        setCalcDisplay("0");
      }
      return;
    }
    setCalcDisplay((prev) => {
      if (prev === "0" && value !== ".") return value;
      return `${prev}${value}`;
    });
  };

  const isPreviewable = (item) => {
    const filePath = item?.filePath || "";
    return Boolean(filePath) && /\.pdf$/i.test(filePath) || item?.mimeType?.includes("pdf") || item?.mimeType?.includes("image");
  };

  if (loading) return <div className="text-sm text-text-muted">Loading materials…</div>;

  return (
    <div className="space-y-5">
      {moduleType === "tet" && (
        <div className="flex justify-end gap-2">
          <button onClick={() => setShowCalculator((prev) => !prev)} className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-sm font-semibold text-text-secondary shadow-card">
            <Calculator size={15} className="text-signal" /> {showCalculator ? "Hide calculator" : "Open calculator"}
          </button>
          <button onClick={() => setShowNotePad((prev) => !prev)} className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-sm font-semibold text-text-secondary shadow-card">
            <NotebookPen size={15} className="text-citrus" /> {showNotePad ? "Hide note pad" : "Open note pad"}
          </button>
        </div>
      )}

      {moduleType === "tet" && showCalculator && (
        <div className="fixed z-50 w-72 max-w-[90vw] rounded-2xl border border-border bg-white shadow-lift" style={{ left: `${notePos.x + 320}px`, top: `${notePos.y}px` }}>
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">Calculator</span>
              <button onClick={() => setShowCalculator(false)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>
          </div>
          <div className="space-y-3 p-3">
            <div className="rounded-xl border border-border bg-paper px-3 py-3 text-right text-lg font-semibold text-text-primary">{calcDisplay}</div>
            <div className="grid grid-cols-4 gap-2">
              {['7','8','9','/','4','5','6','*','1','2','3','-','0','.','C','+'].map((btn) => (
                <button key={btn} onClick={() => handleCalculatorButton(btn)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-paper">{btn}</button>
              ))}
              <button onClick={() => handleCalculatorButton('=')} className="col-span-4 rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-white hover:bg-signal-dark">=</button>
            </div>
          </div>
        </div>
      )}

      {moduleType === "tet" && showNotePad && (
        <div
          className="fixed z-50 w-80 max-w-[90vw] rounded-2xl border border-border bg-white shadow-lift"
          style={{ left: `${notePos.x}px`, top: `${notePos.y}px` }}
          onMouseMove={onDrag}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2 cursor-move" onMouseDown={startDrag}>
            <div className="flex items-center gap-2">
              <Grip size={14} className="text-text-muted" />
              <span className="text-sm font-semibold text-text-primary">Floating note pad</span>
            </div>
            <button onClick={() => setShowNotePad(false)} className="text-text-muted hover:text-text-primary">✕</button>
          </div>
          <div className="p-3">
            <textarea
              rows={8}
              value={notes.general || ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, general: e.target.value }))}
              className="input"
              placeholder="Type notes while learning…"
            />
          </div>
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
                {item.description ? <p className="mt-3 text-sm text-text-secondary">{item.description}</p> : <p className="mt-3 text-sm text-text-muted">Prepared learning material is available for this module.</p>}
                {item.filePath ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isPreviewable(item) && (
                      <button onClick={() => onPreviewRequest?.(item)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-white">
                        Preview PDF
                      </button>
                    )}
                    <a href={getFileUrl(item.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white hover:bg-ink-light">
                      <Download size={13} /> Download file
                    </a>
                  </div>
                ) : null}
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
                    {isPreviewable(item) && (
                      <button onClick={() => onPreviewRequest?.(item)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-white">
                        Preview PDF
                      </button>
                    )}
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
                    {isPreviewable(item) && (
                      <button onClick={() => onPreviewRequest?.(item)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-white">
                        Preview PDF
                      </button>
                    )}
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
