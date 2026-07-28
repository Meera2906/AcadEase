import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock3, FileText, PlayCircle, Upload } from "lucide-react";
import api from "../../api/client.js";

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function PyqPracticePanel() {
  const [file, setFile] = useState(null);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (phase !== "running" || timeLeft <= 0) return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, timeLeft]);

  useEffect(() => {
    if (phase === "running" && timeLeft === 0) {
      submitTest(true);
    }
  }, [phase, timeLeft]);

  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return Math.round((Object.keys(answers).length / questions.length) * 100);
  }, [answers, questions]);

  async function handleStart(e) {
    e.preventDefault();
    if (!file) {
      setMessage("Please upload a PDF first.");
      return;
    }

    setLoading(true);
    setMessage("");
    const payload = new FormData();
    payload.append("file", file);
    payload.append("timeLimitMinutes", String(timeLimitMinutes));

    try {
      const res = await api.post("/study-materials/pyq-practice", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setQuestions(res.data.questions || []);
      setAnswers({});
      setResult(null);
      setTimeLeft(Number(res.data.timeLimitMinutes || timeLimitMinutes) * 60);
      setPhase("running");
    } catch (err) {
      setMessage(err.response?.data?.error || "Unable to process the PDF right now.");
    } finally {
      setLoading(false);
    }
  }

  function submitTest(autoSubmitted = false) {
    if (phase !== "running") return;

    const scored = questions.map((question, index) => {
      const id = question._id || question.number || index + 1;
      const selected = answers[id] || "";
      const correct = (question.correctAnswer || "").toString().trim().toUpperCase();
      const selectedValue = selected.toString().trim().toUpperCase();
      return {
        ...question,
        selectedAnswer: selectedValue,
        isCorrect: Boolean(correct && selectedValue && selectedValue === correct),
      };
    });

    const score = scored.filter((item) => item.isCorrect).length;
    setResult({ score, total: scored.length, questions: scored, autoSubmitted: autoSubmitted });
    setPhase("completed");
    setTimeLeft(0);
  }

  function handleAnswer(question, value) {
    const id = question._id || question.number || questions.indexOf(question) + 1;
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {phase === "idle" && (
        <form onSubmit={handleStart} className="rounded-card border border-border bg-white p-4 shadow-card">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-signal" />
            <h3 className="font-semibold text-text-primary">Upload PYQ PDF</h3>
          </div>
          <p className="mt-2 text-sm text-text-secondary">Upload a previous year paper PDF. The questions will be extracted and turned into an interactive quiz.</p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="label">Choose PDF</label>
              <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-text-secondary" />
            </div>
            <div>
              <label className="label">Timer (minutes)</label>
              <input type="number" min="5" max="180" value={timeLimitMinutes} onChange={(e) => setTimeLimitMinutes(Number(e.target.value) || 5)} className="input" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-white hover:bg-signal-dark disabled:opacity-60">
            <Upload size={15} /> {loading ? "Processing…" : "Start PYQ practice"}
          </button>
        </form>
      )}

      {phase === "running" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-text-primary">PYQ Practice in progress</h3>
                <p className="text-sm text-text-secondary">Answer each question before the timer ends.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1 text-sm font-semibold text-text-secondary">
                <Clock3 size={15} className="text-citrus" /> {formatTime(timeLeft)}
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-border overflow-hidden">
              <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-text-muted">Answered: {Object.keys(answers).length}/{questions.length}</p>
          </div>

          <div className="space-y-3">
            {questions.map((question, index) => {
              const id = question._id || question.number || index + 1;
              const selected = answers[id] || "";
              return (
                <div key={id} className="rounded-card border border-border bg-white p-4 shadow-card">
                  <p className="text-sm font-semibold text-text-primary">{index + 1}. {question.question}</p>
                  {question.options?.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {question.options.map((option) => (
                        <label key={`${id}-${option.label}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary">
                          <input type="radio" name={id} checked={selected === option.label} onChange={() => handleAnswer(question, option.label)} />
                          <span className="font-semibold text-text-primary">{option.label}.</span>
                          <span>{option.text}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea value={selected} onChange={(e) => handleAnswer(question, e.target.value)} className="input mt-3" rows={3} placeholder="Type your answer" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => submitTest(false)} className="inline-flex items-center gap-2 rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-white hover:bg-signal-dark">
              <PlayCircle size={15} /> Submit answers
            </button>
            <button onClick={() => setPhase("idle")} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-paper">
              Start over
            </button>
          </div>
        </div>
      )}

      {phase === "completed" && result && (
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-white p-4 shadow-card">
            <h3 className="font-semibold text-text-primary">PYQ Practice result</h3>
            <p className="mt-1 text-sm text-text-secondary">
              {result.autoSubmitted ? "The timer ended automatically." : "You submitted the test manually."}
            </p>
            <div className="mt-3 rounded-xl bg-paper px-3 py-3 text-sm text-text-secondary">
              Score: <span className="font-semibold text-text-primary">{result.score}/{result.total}</span>
            </div>
          </div>

          <div className="space-y-3">
            {result.questions.map((question, index) => (
              <div key={question._id || question.number || index + 1} className="rounded-card border border-border bg-white p-4 shadow-card">
                <p className="text-sm font-semibold text-text-primary">{index + 1}. {question.question}</p>
                <p className="mt-2 text-sm text-text-secondary">Your answer: <span className="font-semibold text-text-primary">{question.selectedAnswer || "No answer"}</span></p>
                {question.correctAnswer ? (
                  <p className="mt-1 text-sm text-text-secondary">Correct answer: <span className="font-semibold text-text-primary">{question.correctAnswer}</span></p>
                ) : (
                  <p className="mt-1 text-sm text-text-muted">No answer key was detected in the uploaded PDF.</p>
                )}
                <p className={`mt-2 text-sm font-semibold ${question.isCorrect ? "text-success" : question.selectedAnswer ? "text-warning" : "text-text-muted"}`}>
                  {!question.selectedAnswer ? "Not answered" : question.isCorrect ? "Correct" : "Incorrect"}
                </p>
              </div>
            ))}
          </div>

          <button onClick={() => setPhase("idle")} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-paper">
            Try another PYQ
          </button>
        </div>
      )}
    </div>
  );
}
