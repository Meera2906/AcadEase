import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";

const STATUS_OPTIONS = [
  { key: "present", label: "P",  color: "bg-success" },
  { key: "absent",  label: "A",  color: "bg-danger" },
  { key: "od",      label: "OD", color: "bg-signal" },
  { key: "late",    label: "L",  color: "bg-warning" },
];

export default function FacultyAttendanceMarking() {
  const [courseId, setCourseId]         = useState("CS301");
  const [date, setDate]                 = useState(new Date().toISOString().slice(0, 10));
  const [studentIdsRaw, setStudentIdsRaw] = useState("");
  const [rows, setRows]                 = useState([]);
  const [result, setResult]             = useState(null);
  const [submitting, setSubmitting]     = useState(false);

  function loadRoster() {
    const ids = studentIdsRaw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    setRows(ids.map((studentId) => ({ studentId, status: "present", note: "" })));
    setResult(null);
  }

  function setStatus(studentId, status) {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  }

  function markAllPresent() {
    setRows((prev) => prev.map((r) => ({ ...r, status: "present" })));
  }

  async function submitAttendance() {
    setSubmitting(true);
    setResult(null);
    try {
      const { data } = await api.post("/attendance/mark", {
        courseId,
        date,
        sessionTime: "09:00",
        records: rows.map(({ studentId, status, note }) => ({ studentId, status, note })),
      });
      setResult({ ok: true, message: data.message });
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.error || "Failed to submit attendance" });
    } finally {
      setSubmitting(false);
    }
  }

  const absentCount = rows.filter((r) => r.status === "absent").length;

  return (
    <AppShell>
      <div className="flex items-center gap-2 mb-1">
        <CalendarCheck size={20} className="text-signal" />
        <h1 className="font-display text-2xl font-bold text-text-primary">Mark Attendance</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        One tap per student. Submitting fires the absent-notification pipeline instantly.
      </p>

      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="label">Course</label>
            <input
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="input font-mono"
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label">
            Student IDs (comma or newline separated — from seed output)
          </label>
          <textarea
            value={studentIdsRaw}
            onChange={(e) => setStudentIdsRaw(e.target.value)}
            rows={3}
            placeholder="STU_2021_CS_001, STU_2021_CS_002, ..."
            className="input font-mono"
          />
        </div>
        <Button variant="secondary" className="mt-3" onClick={loadRoster}>
          Load roster
        </Button>
      </Card>

      {rows.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-secondary">
              {rows.length} students
              {absentCount > 0 && (
                <span className="text-danger font-medium"> · {absentCount} absent</span>
              )}
            </p>
            <Button variant="secondary" onClick={markAllPresent}>
              Mark all present
            </Button>
          </div>

          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.studentId} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-text-primary font-mono">{r.studentId}</span>
                <div className="flex items-center gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setStatus(r.studentId, opt.key)}
                      className={`w-9 h-9 rounded-full text-xs font-bold text-white transition-all ${
                        r.status === opt.key
                          ? `${opt.color} scale-100 shadow-card`
                          : "bg-[#EFEBDF] text-text-muted scale-90 hover:scale-95"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {result && (
            <div
              className={`mt-4 text-sm rounded-card px-4 py-2.5 ${
                result.ok ? "bg-[#E9FCE0] text-success" : "bg-[#FFE7E9] text-danger"
              }`}
            >
              {result.message}
            </div>
          )}

          <Button className="mt-4 w-full" onClick={submitAttendance} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Attendance"}
          </Button>
        </Card>
      )}
    </AppShell>
  );
}
