import { useEffect, useState } from "react";
import {
  CalendarCheck, ChevronRight, ChevronLeft, Clock,
  Users, CheckCircle, XCircle, Briefcase, AlertTriangle,
  Check, X,
} from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";

const HOURS = [
  { key: "09:00", label: "1st Hour", time: "9:00 AM" },
  { key: "10:00", label: "2nd Hour", time: "10:00 AM" },
  { key: "11:00", label: "3rd Hour", time: "11:00 AM" },
  { key: "12:00", label: "4th Hour", time: "12:00 PM" },
  { key: "14:00", label: "5th Hour", time: "2:00 PM" },
  { key: "15:00", label: "6th Hour", time: "3:00 PM" },
  { key: "16:00", label: "7th Hour", time: "4:00 PM" },
];

const STATUS_CONFIG = {
  present: { label: "Present", short: "P", bg: "bg-success", ring: "ring-success", text: "text-white", light: "bg-success/10 text-success border-success/30" },
  absent:  { label: "Absent",  short: "A", bg: "bg-danger",  ring: "ring-danger",  text: "text-white", light: "bg-danger/10 text-danger border-danger/30" },
  od:      { label: "On Duty", short: "OD", bg: "bg-signal", ring: "ring-signal",  text: "text-white", light: "bg-signal/10 text-signal border-signal/30" },
};

// ── Step indicator ────────────────────────────────────────────────────────────
function Steps({ current }) {
  const steps = ["Select Class", "Select Hour", "Mark Attendance"];
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = current > idx;
        const active = current === idx;
        return (
          <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className="flex items-center gap-2 shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                done ? "bg-success text-white" : active ? "bg-signal text-white" : "bg-border text-text-muted"
              }`}>
                {done ? <Check size={13} /> : idx}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${active ? "text-text-primary" : "text-text-muted"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${done ? "bg-success" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Confirmation popup ────────────────────────────────────────────────────────
function ConfirmModal({ rows, course, hour, date, onConfirm, onCancel, submitting }) {
  const present = rows.filter((r) => r.status === "present");
  const absent  = rows.filter((r) => r.status === "absent");
  const od      = rows.filter((r) => r.status === "od");
  const hourLabel = HOURS.find((h) => h.key === hour)?.label || hour;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
      <div className="bg-white rounded-card shadow-lift w-full max-w-md">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <CalendarCheck size={18} className="text-signal" />
            <h2 className="font-display font-bold text-text-primary">Confirm Attendance</h2>
          </div>
          <p className="text-xs text-text-muted">
            {course.name} · {hourLabel} · {date}
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 px-6 py-5">
          <div className="flex flex-col items-center gap-1.5 bg-success/8 border border-success/20 rounded-xl p-3">
            <CheckCircle size={22} className="text-success" />
            <span className="text-2xl font-bold text-success tabular-nums">{present.length}</span>
            <span className="text-xs text-text-muted font-medium">Present</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 bg-danger/8 border border-danger/20 rounded-xl p-3">
            <XCircle size={22} className="text-danger" />
            <span className="text-2xl font-bold text-danger tabular-nums">{absent.length}</span>
            <span className="text-xs text-text-muted font-medium">Absent</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 bg-signal/8 border border-signal/20 rounded-xl p-3">
            <Briefcase size={22} className="text-signal" />
            <span className="text-2xl font-bold text-signal tabular-nums">{od.length}</span>
            <span className="text-xs text-text-muted font-medium">On Duty</span>
          </div>
        </div>

        {/* Absent list preview */}
        {absent.length > 0 && (
          <div className="px-6 pb-4">
            <p className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1">
              <AlertTriangle size={12} className="text-danger" />
              Absent students (will receive instant notification)
            </p>
            <div className="bg-danger/5 border border-danger/15 rounded-xl px-3 py-2 max-h-28 overflow-y-auto space-y-1">
              {absent.map((r) => (
                <div key={r.studentId} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-text-primary">{r.name}</span>
                  <span className="font-mono text-text-muted">{r.enrollmentNumber}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-paper transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-signal text-white text-sm font-semibold hover:bg-signal-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
            ) : (
              <><Check size={15} /> Submit Attendance</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FacultyAttendanceMarking() {
  const today = new Date().toISOString().slice(0, 10);

  // Step 1 state
  const [courses, setCourses]       = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);

  // Step 2 state
  const [selectedHour, setSelectedHour] = useState(null);

  // Step 3 state
  const [rows, setRows]             = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState("");

  const step = selectedCourse === null ? 1 : selectedHour === null ? 2 : 3;

  // Load faculty's courses on mount
  useEffect(() => {
    api.get("/attendance/faculty/courses")
      .then((res) => setCourses(res.data.courses || []))
      .catch(() => setError("Failed to load your courses."))
      .finally(() => setCoursesLoading(false));
  }, []);

  // Load roster when course + hour are both selected
  useEffect(() => {
    if (!selectedCourse || !selectedHour) return;
    setRosterLoading(true);
    setRows([]);
    api.get(`/attendance/course/${selectedCourse.courseId}/roster`)
      .then((res) => {
        const students = res.data.students || [];
        setRows(students.map((s) => ({
          studentId: s.userId,
          name: s.name,
          enrollmentNumber: s.enrollmentNumber || s.userId,
          status: "present", // default all present
        })));
      })
      .catch(() => setError("Failed to load student roster."))
      .finally(() => setRosterLoading(false));
  }, [selectedCourse, selectedHour]);

  function setStatus(studentId, status) {
    setRows((prev) => prev.map((r) => r.studentId === studentId ? { ...r, status } : r));
  }

  function markAll(status) {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      await api.post("/attendance/mark", {
        courseId: selectedCourse.courseId,
        date: today,
        sessionTime: selectedHour,
        records: rows.map(({ studentId, status }) => ({ studentId, status, note: "" })),
      });
      setShowConfirm(false);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to submit attendance.");
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setSelectedCourse(null);
    setSelectedHour(null);
    setRows([]);
    setSubmitted(false);
    setError("");
  }

  const presentCount = rows.filter((r) => r.status === "present").length;
  const absentCount  = rows.filter((r) => r.status === "absent").length;
  const odCount      = rows.filter((r) => r.status === "od").length;
  const hourLabel    = HOURS.find((h) => h.key === selectedHour)?.label || "";

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 max-w-lg mx-auto">
          <div className="bg-white border border-border rounded-card shadow-card p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-success" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-text-primary">Attendance Submitted!</h2>
              <p className="text-sm text-text-secondary mt-1">
                {selectedCourse?.name} · {hourLabel} · {today}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { label: "Present", value: presentCount, color: "text-success" },
                { label: "Absent",  value: absentCount,  color: "text-danger" },
                { label: "On Duty", value: odCount,      color: "text-signal" },
              ].map((s) => (
                <div key={s.label} className="bg-paper rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-text-muted">{s.label}</p>
                </div>
              ))}
            </div>
            {absentCount > 0 && (
              <p className="text-xs text-text-muted">
                {absentCount} absent notification{absentCount > 1 ? "s" : ""} sent instantly.
              </p>
            )}
            <button
              onClick={reset}
              className="w-full mt-2 px-4 py-2.5 bg-signal text-white rounded-xl text-sm font-semibold hover:bg-signal-dark transition-colors"
            >
              Mark Another Class
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <>
      {showConfirm && selectedCourse && (
        <ConfirmModal
          rows={rows}
          course={selectedCourse}
          hour={selectedHour}
          date={today}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
          submitting={submitting}
        />
      )}

      <AppShell>
        <div className="p-4 md:p-6 max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <CalendarCheck size={20} className="text-signal" />
            <h1 className="font-display text-2xl font-bold text-text-primary">Mark Attendance</h1>
          </div>
          <p className="text-sm text-text-secondary mb-5">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>

          <Steps current={step} />

          {error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/20 rounded-card px-4 py-3">
              <AlertTriangle size={15} className="shrink-0" /> {error}
            </div>
          )}

          {/* ── Step 1: Choose class ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
                <Users size={15} /> Select the class you're teaching today
              </p>
              {coursesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-white border border-border rounded-card animate-pulse" />
                  ))}
                </div>
              ) : courses.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-10">No courses assigned to you.</p>
              ) : (
                courses.map((c) => (
                  <button
                    key={c.courseId}
                    onClick={() => { setSelectedCourse(c); setError(""); }}
                    className="w-full bg-white border border-border rounded-card p-4 shadow-card hover:shadow-lift hover:border-signal/30 transition-all text-left flex items-center justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-signal bg-signal/10 px-2 py-0.5 rounded-pill">
                          {c.courseId}
                        </span>
                        <span className="text-xs text-text-muted">Sem {c.semester} · Sec {c.section}</span>
                      </div>
                      <p className="font-semibold text-text-primary text-sm">{c.name}</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {c.enrolledCount} students enrolled
                        {c.markedHours.length > 0 && (
                          <span className="ml-2 text-success font-medium">
                            · {c.markedHours.length} hour{c.markedHours.length > 1 ? "s" : ""} marked today
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-text-muted group-hover:text-signal transition-colors shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── Step 2: Choose hour ── */}
          {step === 2 && selectedCourse && (
            <div>
              <button
                onClick={() => { setSelectedCourse(null); setSelectedHour(null); }}
                className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4 transition-colors"
              >
                <ChevronLeft size={15} /> Back
              </button>

              {/* Selected course pill */}
              <div className="bg-signal/5 border border-signal/20 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-signal flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">{selectedCourse.courseId.slice(-3)}</span>
                </div>
                <div>
                  <p className="font-semibold text-text-primary text-sm">{selectedCourse.name}</p>
                  <p className="text-xs text-text-muted">{selectedCourse.enrolledCount} students · Sem {selectedCourse.semester} Sec {selectedCourse.section}</p>
                </div>
              </div>

              <p className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
                <Clock size={15} /> Which hour are you marking?
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {HOURS.map((h) => {
                  const alreadyMarked = selectedCourse.markedHours.includes(h.key);
                  return (
                    <button
                      key={h.key}
                      onClick={() => { if (!alreadyMarked) { setSelectedHour(h.key); setError(""); } }}
                      disabled={alreadyMarked}
                      className={`relative flex flex-col items-center gap-1 p-4 rounded-xl border transition-all ${
                        alreadyMarked
                          ? "bg-paper border-border opacity-50 cursor-not-allowed"
                          : "bg-white border-border hover:border-signal/40 hover:shadow-card cursor-pointer"
                      }`}
                    >
                      {alreadyMarked && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-success rounded-full flex items-center justify-center">
                          <Check size={9} className="text-white" />
                        </span>
                      )}
                      <span className="text-sm font-bold text-text-primary">{h.label}</span>
                      <span className="text-xs text-text-muted">{h.time}</span>
                      {alreadyMarked && <span className="text-[10px] text-success font-medium">Marked</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 3: Mark students ── */}
          {step === 3 && selectedCourse && selectedHour && (
            <div>
              <button
                onClick={() => { setSelectedHour(null); setRows([]); }}
                className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4 transition-colors"
              >
                <ChevronLeft size={15} /> Back
              </button>

              {/* Context bar */}
              <div className="bg-white border border-border rounded-card px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-text-primary text-sm">{selectedCourse.name}</p>
                  <p className="text-xs text-text-muted">{hourLabel} · {today}</p>
                </div>
                {/* Live counters */}
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="text-success">{presentCount}P</span>
                  <span className="text-danger">{absentCount}A</span>
                  <span className="text-signal">{odCount}OD</span>
                  <span className="text-text-muted">/ {rows.length}</span>
                </div>
              </div>

              {/* Bulk actions */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => markAll("present")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 text-success border border-success/20 rounded-xl text-xs font-semibold hover:bg-success/20 transition-colors"
                >
                  <CheckCircle size={13} /> All Present
                </button>
                <button
                  onClick={() => markAll("absent")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/10 text-danger border border-danger/20 rounded-xl text-xs font-semibold hover:bg-danger/20 transition-colors"
                >
                  <XCircle size={13} /> All Absent
                </button>
              </div>

              {/* Student roster */}
              {rosterLoading ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map((i) => (
                    <div key={i} className="h-14 bg-white border border-border rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-paper/60 border-b border-border text-xs font-semibold text-text-muted uppercase tracking-wide">
                    <div className="col-span-1">#</div>
                    <div className="col-span-5">Name</div>
                    <div className="col-span-3">Reg. No.</div>
                    <div className="col-span-3 text-center">Status</div>
                  </div>

                  <div className="divide-y divide-border">
                    {rows.map((r, idx) => (
                      <div
                        key={r.studentId}
                        className={`grid grid-cols-12 gap-2 px-4 py-3 items-center transition-colors ${
                          r.status === "absent" ? "bg-danger/3" : r.status === "od" ? "bg-signal/3" : ""
                        }`}
                      >
                        <div className="col-span-1 text-xs text-text-muted tabular-nums">{idx + 1}</div>
                        <div className="col-span-5">
                          <p className="text-sm font-medium text-text-primary leading-tight">{r.name}</p>
                        </div>
                        <div className="col-span-3">
                          <p className="text-xs font-mono text-text-muted">{r.enrollmentNumber}</p>
                        </div>
                        <div className="col-span-3 flex items-center justify-center gap-1.5">
                          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                            <button
                              key={key}
                              onClick={() => setStatus(r.studentId, key)}
                              title={cfg.label}
                              className={`h-8 rounded-lg text-xs font-bold transition-all ${
                                key === "od" ? "px-2" : "w-8"
                              } ${
                                r.status === key
                                  ? `${cfg.bg} ${cfg.text} shadow-sm scale-105`
                                  : "bg-paper text-text-muted hover:bg-border"
                              }`}
                            >
                              {cfg.short}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit button */}
              {rows.length > 0 && !rosterLoading && (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="mt-5 w-full py-3 bg-signal text-white rounded-xl font-semibold text-sm hover:bg-signal-dark transition-colors flex items-center justify-center gap-2 shadow-card"
                >
                  <CalendarCheck size={16} /> Review & Submit Attendance
                </button>
              )}
            </div>
          )}
        </div>
      </AppShell>
    </>
  );
}
