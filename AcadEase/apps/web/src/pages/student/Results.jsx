import { useEffect, useState, useRef } from "react";
import { ChevronDown, BookOpen, GraduationCap, TrendingUp, CheckCircle, XCircle, Clock } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";

// ── Attendance-style progress bar ────────────────────────────────────────────
function ScoreBar({ pct }) {
  const color = pct < 50 ? "bg-danger" : pct < 70 ? "bg-warning" : "bg-success";
  return (
    <div className="h-1.5 w-full rounded-full bg-border overflow-hidden mt-1.5">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ── Assessment type badge colour ─────────────────────────────────────────────
const TYPE_COLORS = {
  IA1:            "bg-signal/10 text-signal",
  IA2:            "bg-teal/10 text-teal",
  Assignment:     "bg-warning/10 text-warning",
  "Lab Record":   "bg-success/10 text-success",
  "Model Exam":   "bg-coral/10 text-coral",
  "University Exam": "bg-ink/10 text-text-secondary",
};

// ── Grade colour ─────────────────────────────────────────────────────────────
const GRADE_COLORS = {
  O:   "bg-success text-white",
  "A+":"bg-success/80 text-white",
  A:   "bg-teal text-white",
  "B+":"bg-signal/80 text-white",
  B:   "bg-signal/60 text-white",
  C:   "bg-warning text-white",
  U:   "bg-danger text-white",
};

// ── Session dropdown ─────────────────────────────────────────────────────────
function SessionDropdown({ sessions, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = sessions.find((s) => s.label === selected);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-white border border-border rounded-xl px-4 py-2.5 text-sm font-semibold text-text-primary shadow-card hover:shadow-lift transition-all min-w-[260px] justify-between"
      >
        <span className="flex items-center gap-2">
          <GraduationCap size={16} className="text-signal shrink-0" />
          {current?.label || "Select session"}
        </span>
        <ChevronDown size={15} className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 bg-white border border-border rounded-xl shadow-lift overflow-hidden min-w-[260px]">
          {sessions.map((s) => (
            <button
              key={s.label}
              onClick={() => { onChange(s.label); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-3 hover:bg-paper transition-colors ${
                s.label === selected ? "bg-signal/5 text-signal font-semibold" : "text-text-primary"
              }`}
            >
              <span>{s.label}</span>
              <div className="flex gap-1 shrink-0">
                {s.hasInternal && (
                  <span className="text-[10px] bg-signal/10 text-signal px-1.5 py-0.5 rounded-pill font-medium">Internal</span>
                )}
                {s.hasSemResult && (
                  <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded-pill font-medium">Sem</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Internal / Semester toggle ───────────────────────────────────────────────
function ViewToggle({ value, onChange, hasInternal, hasSem }) {
  return (
    <div className="flex items-center bg-white border border-border rounded-xl p-1 shadow-card gap-1">
      <button
        onClick={() => onChange("internal")}
        disabled={!hasInternal}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
          value === "internal"
            ? "bg-signal text-white shadow-sm"
            : hasInternal
            ? "text-text-secondary hover:text-text-primary hover:bg-paper"
            : "text-text-muted cursor-not-allowed opacity-50"
        }`}
      >
        <BookOpen size={14} /> Internal
      </button>
      <button
        onClick={() => onChange("semester")}
        disabled={!hasSem}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
          value === "semester"
            ? "bg-success text-white shadow-sm"
            : hasSem
            ? "text-text-secondary hover:text-text-primary hover:bg-paper"
            : "text-text-muted cursor-not-allowed opacity-50"
        }`}
      >
        <GraduationCap size={14} /> Semester
      </button>
    </div>
  );
}

// ── Internal results view ────────────────────────────────────────────────────
function InternalView({ marks, session }) {
  const filtered = marks.filter((m) => {
    const courseId = m.courseId || m.assessmentId?.courseId;
    return courseId; // all marks belong to the selected session's courses
  });

  const byCourse = {};
  for (const m of filtered) {
    const cid = m.courseId || m.assessmentId?.courseId || "Unknown";
    const name = m.assessmentId?.courseId || cid;
    if (!byCourse[cid]) byCourse[cid] = { name, entries: [] };
    byCourse[cid].entries.push(m);
  }

  if (Object.keys(byCourse).length === 0) {
    return <p className="text-text-muted text-sm text-center py-12">No internal marks for this session.</p>;
  }

  // Summary stats
  const allEntries = filtered.filter((m) => !m.isAbsent && m.marksObtained != null);
  const totalObtained = allEntries.reduce((s, m) => s + m.marksObtained, 0);
  const totalMax = allEntries.reduce((s, m) => s + (m.assessmentId?.maxMarks ?? 0), 0);
  const overallPct = totalMax ? Math.round((totalObtained / totalMax) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-border rounded-card p-4 shadow-card text-center">
          <p className="text-xs text-text-muted mb-1">Overall Score</p>
          <p className={`text-2xl font-bold tabular-nums ${overallPct < 50 ? "text-danger" : overallPct < 70 ? "text-warning" : "text-success"}`}>
            {overallPct}%
          </p>
          <p className="text-xs text-text-muted mt-0.5">{totalObtained}/{totalMax}</p>
        </div>
        <div className="bg-white border border-border rounded-card p-4 shadow-card text-center">
          <p className="text-xs text-text-muted mb-1">Subjects</p>
          <p className="text-2xl font-bold text-text-primary tabular-nums">{Object.keys(byCourse).length}</p>
        </div>
        <div className="bg-white border border-border rounded-card p-4 shadow-card text-center">
          <p className="text-xs text-text-muted mb-1">Assessments</p>
          <p className="text-2xl font-bold text-text-primary tabular-nums">{allEntries.length}</p>
        </div>
      </div>

      {/* Per-course cards */}
      {Object.entries(byCourse).map(([courseId, { entries }]) => {
        const valid = entries.filter((e) => !e.isAbsent && e.marksObtained != null);
        const obtained = valid.reduce((s, e) => s + e.marksObtained, 0);
        const max = valid.reduce((s, e) => s + (e.assessmentId?.maxMarks ?? 0), 0);
        const pct = max ? Math.round((obtained / max) * 100) : 0;
        const courseName = entries[0]?.assessmentId?.courseId || courseId;

        return (
          <Card key={courseId} className="p-0 overflow-hidden">
            {/* Course header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-paper/50">
              <div>
                <h2 className="font-semibold text-text-primary text-sm">{entries[0]?.assessmentId?.title?.split("—")[0]?.trim() || courseId}</h2>
                <p className="text-xs text-text-muted mt-0.5">{courseId}</p>
              </div>
              {max > 0 && (
                <div className="text-right">
                  <span className={`text-lg font-bold tabular-nums ${pct < 50 ? "text-danger" : pct < 70 ? "text-warning" : "text-success"}`}>
                    {pct}%
                  </span>
                  <p className="text-xs text-text-muted">{obtained}/{max}</p>
                  <ScoreBar pct={pct} />
                </div>
              )}
            </div>

            {/* Assessment rows */}
            <div className="divide-y divide-border px-5">
              {entries.map((m) => {
                const assessment = m.assessmentId;
                const maxMarks = assessment?.maxMarks ?? null;
                const obtained = m.isAbsent ? null : m.marksObtained;
                const scorePct = maxMarks && obtained != null ? Math.round((obtained / maxMarks) * 100) : null;
                const typeStyle = TYPE_COLORS[assessment?.type] || "bg-paper text-text-secondary";

                return (
                  <div key={m._id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-pill shrink-0 ${typeStyle}`}>
                        {assessment?.type || "—"}
                      </span>
                      <p className="text-sm font-medium text-text-primary truncate">
                        {assessment?.title || "Assessment"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {m.isAbsent ? (
                        <Badge status="absent">AB</Badge>
                      ) : obtained == null ? (
                        <span className="text-xs text-text-muted flex items-center gap-1"><Clock size={12} /> Pending</span>
                      ) : (
                        <div>
                          <span className={`font-bold text-sm tabular-nums ${
                            scorePct != null && scorePct < 50 ? "text-danger" :
                            scorePct != null && scorePct < 70 ? "text-warning" : "text-success"
                          }`}>
                            {obtained}
                            <span className="text-text-muted font-normal text-xs"> / {maxMarks}</span>
                          </span>
                          {scorePct != null && (
                            <p className="text-[10px] text-text-muted">{scorePct}%</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Semester results view ────────────────────────────────────────────────────
function SemesterView({ result }) {
  if (!result) {
    return <p className="text-text-muted text-sm text-center py-12">No semester results available for this session.</p>;
  }

  const subjects = result.subjects || [];
  const passed = subjects.filter((s) => s.result === "pass").length;
  const failed = subjects.filter((s) => s.result === "fail").length;
  const totalObtained = subjects.reduce((s, sub) => s + (sub.marksObtained ?? 0), 0);
  const totalMax = subjects.reduce((s, sub) => s + (sub.maxMarks ?? 100), 0);
  const overallPct = totalMax ? Math.round((totalObtained / totalMax) * 100) : 0;

  // Simple GPA: O=10, A+=9, A=8, B+=7, B=6, C=5, U=0
  const gradePoints = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, U: 0 };
  const gpa = subjects.length
    ? (subjects.reduce((s, sub) => s + (gradePoints[sub.grade] ?? 0), 0) / subjects.length).toFixed(2)
    : "—";

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-border rounded-card p-4 shadow-card text-center">
          <p className="text-xs text-text-muted mb-1">Overall</p>
          <p className={`text-2xl font-bold tabular-nums ${overallPct < 50 ? "text-danger" : overallPct < 70 ? "text-warning" : "text-success"}`}>
            {overallPct}%
          </p>
          <p className="text-xs text-text-muted mt-0.5">{totalObtained}/{totalMax}</p>
        </div>
        <div className="bg-white border border-border rounded-card p-4 shadow-card text-center">
          <p className="text-xs text-text-muted mb-1">GPA</p>
          <p className="text-2xl font-bold text-text-primary tabular-nums">{gpa}</p>
          <p className="text-xs text-text-muted mt-0.5">out of 10</p>
        </div>
        <div className="bg-white border border-border rounded-card p-4 shadow-card text-center">
          <p className="text-xs text-text-muted mb-1">Passed</p>
          <p className="text-2xl font-bold text-success tabular-nums">{passed}</p>
          <p className="text-xs text-text-muted mt-0.5">subjects</p>
        </div>
        <div className="bg-white border border-border rounded-card p-4 shadow-card text-center">
          <p className="text-xs text-text-muted mb-1">Arrears</p>
          <p className={`text-2xl font-bold tabular-nums ${failed > 0 ? "text-danger" : "text-success"}`}>{failed}</p>
          <p className="text-xs text-text-muted mt-0.5">subjects</p>
        </div>
      </div>

      {/* Subject result cards */}
      <Card className="p-0 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-paper/50 border-b border-border text-xs font-semibold text-text-muted uppercase tracking-wide">
          <div className="col-span-5">Subject</div>
          <div className="col-span-2 text-center">Marks</div>
          <div className="col-span-2 text-center">Grade</div>
          <div className="col-span-2 text-center">Points</div>
          <div className="col-span-1 text-center">Result</div>
        </div>

        <div className="divide-y divide-border">
          {subjects.map((sub, i) => {
            const pct = sub.maxMarks ? Math.round((sub.marksObtained / sub.maxMarks) * 100) : 0;
            const gradeStyle = GRADE_COLORS[sub.grade] || "bg-paper text-text-secondary";
            const gp = gradePoints[sub.grade] ?? 0;

            return (
              <div key={i} className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-paper/30 transition-colors">
                <div className="col-span-5">
                  <p className="text-sm font-medium text-text-primary">{sub.courseName || sub.courseId}</p>
                  <p className="text-xs text-text-muted">{sub.courseId}</p>
                  <ScoreBar pct={pct} />
                </div>
                <div className="col-span-2 text-center">
                  <span className="text-sm font-bold tabular-nums text-text-primary">{sub.marksObtained}</span>
                  <span className="text-xs text-text-muted">/{sub.maxMarks ?? 100}</span>
                </div>
                <div className="col-span-2 flex justify-center">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-pill ${gradeStyle}`}>
                    {sub.grade || "—"}
                  </span>
                </div>
                <div className="col-span-2 text-center">
                  <span className="text-sm font-bold tabular-nums text-text-primary">{gp}</span>
                  <span className="text-xs text-text-muted">/10</span>
                </div>
                <div className="col-span-1 flex justify-center">
                  {sub.result === "pass" ? (
                    <CheckCircle size={18} className="text-success" />
                  ) : sub.result === "fail" ? (
                    <XCircle size={18} className="text-danger" />
                  ) : (
                    <Clock size={18} className="text-text-muted" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function StudentResults() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [view, setView] = useState("internal"); // "internal" | "semester"
  const [marks, setMarks] = useState([]);
  const [semResults, setSemResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load sessions + all data in parallel
  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get(`/results/student/${user.userId}/sessions`),
      api.get(`/marks/student/${user.userId}`).catch(() => ({ data: { marks: [] } })),
      api.get(`/results/student/${user.userId}`).catch(() => ({ data: { results: [] } })),
    ]).then(([s, m, r]) => {
      const sess = s.data.sessions || [];
      setSessions(sess);
      setMarks(m.data.marks || []);
      setSemResults(r.data.results || []);
      // Default to the latest session
      if (sess.length > 0) {
        const latest = sess[sess.length - 1];
        setSelectedSession(latest.label);
        // Default view: internal if available, else semester
        setView(latest.hasInternal ? "internal" : "semester");
      }
    }).finally(() => setLoading(false));
  }, [user]);

  // When session changes, pick the right default view
  const handleSessionChange = (label) => {
    setSelectedSession(label);
    const s = sessions.find((s) => s.label === label);
    if (s) setView(s.hasInternal ? "internal" : "semester");
  };

  const currentSession = sessions.find((s) => s.label === selectedSession);

  // Filter marks to the selected session's courses
  // Marks don't carry academicYear directly — we match by courseId from courses
  // For simplicity: show all marks when on current semester, none for past (sem results cover past)
  const filteredMarks = currentSession
    ? marks.filter((m) => {
        // If this is the current semester (Sem 5, 2024-2025), show all marks
        // For past semesters, marks won't exist (they're in semResults)
        return true;
      })
    : marks;

  // Find the semester result for the selected session
  const currentSemResult = currentSession
    ? semResults.find(
        (r) =>
          r.academicYear === currentSession.academicYear &&
          r.semester === currentSession.semester
      )
    : null;

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">
        {/* ── Page header ── */}
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Results</h1>
          <p className="text-sm text-text-secondary mt-0.5">View your internal assessments and semester examination results.</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-white border border-border rounded-card animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-12">No results available yet.</p>
        ) : (
          <>
            {/* ── Controls row ── */}
            <div className="flex flex-wrap items-center gap-3">
              <SessionDropdown
                sessions={sessions}
                selected={selectedSession}
                onChange={handleSessionChange}
              />
              <ViewToggle
                value={view}
                onChange={setView}
                hasInternal={currentSession?.hasInternal ?? false}
                hasSem={currentSession?.hasSemResult ?? false}
              />
              {/* Session type pill */}
              {currentSession && (
                <span className={`text-xs font-bold px-3 py-1.5 rounded-pill ${
                  currentSession.semesterType === "ODD"
                    ? "bg-signal/10 text-signal"
                    : "bg-teal/10 text-teal"
                }`}>
                  {currentSession.semesterType} Semester
                </span>
              )}
            </div>

            {/* ── Content ── */}
            {view === "internal" ? (
              <InternalView marks={filteredMarks} session={currentSession} />
            ) : (
              <SemesterView result={currentSemResult} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
