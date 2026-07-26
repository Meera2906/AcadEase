import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Flame, BookOpen, Mail, Phone, Hash, GraduationCap } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import AttendanceRing from "../../components/ui/AttendanceRing.jsx";

function getInitials(name = "") {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function StudentProfile() {
  const { studentId } = useParams();
  const navigate      = useNavigate();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    api.get(`/admin/users/${studentId}`)
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load student profile."))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-4">
          {[1,2,3].map((i) => <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-secondary hover:text-signal mb-4">
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-danger text-sm">{error || "Student not found."}</p>
      </AppShell>
    );
  }

  const { student, attendance, marks, xp } = data;
  const overall = attendance?.overallPercentage ?? 0;

  const marksByCourse = {};
  for (const m of marks || []) {
    const cid = m.courseId || m.assessmentId?.courseId || "Unknown";
    if (!marksByCourse[cid]) marksByCourse[cid] = [];
    marksByCourse[cid].push(m);
  }

  return (
    <AppShell>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-signal mb-5 transition-colors"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Hero — ink-fade Campus Pass style */}
      <div className="relative overflow-hidden rounded-card bg-ink-fade p-6 md:p-8 mb-6">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-signal/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 w-56 h-56 rounded-full bg-citrus/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-signal/80 border-2 border-white/20 text-white flex items-center justify-center font-display text-xl font-bold shrink-0">
              {getInitials(student.name)}
            </div>
            <div>
              <p className="text-white/50 text-xs font-mono tracking-wider mb-1">STUDENT PROFILE</p>
              <p className="font-display text-xl font-bold text-white">{student.name}</p>
              <p className="text-white/50 text-sm font-mono mt-0.5">{student.enrollmentNumber}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <InfoChip icon={GraduationCap} text={`Sem ${student.semester} · Sec ${student.section}`} />
                <InfoChip icon={Mail} text={student.email} />
                {student.phone && <InfoChip icon={Phone} text={student.phone} />}
                <InfoChip icon={Hash} text={student.departmentId} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {xp?.streak > 0 && (
              <div className="flex items-center gap-2 bg-white/10 rounded-pill px-4 py-2">
                <Flame size={16} className="text-citrus" />
                <p className="text-white font-display font-bold text-sm">{xp.streak} day streak</p>
              </div>
            )}
            <AttendanceRing percentage={overall} label="OVERALL" dark />
          </div>
        </div>
      </div>

      {/* XP mini stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <MiniStat label="Overall Attendance" value={`${overall}%`}
          color={overall < 75 ? "text-danger" : overall < 85 ? "text-warning" : "text-success"} />
        <MiniStat label="Streak" value={`${xp?.streak ?? 0} days`} color="text-warning"
          icon={<Flame size={14} className="text-warning" />} />
        <MiniStat label="Academic XP" value={xp?.totalXp ?? 0} color="text-teal"
          icon={<BookOpen size={14} className="text-teal" />} />
        <MiniStat label="Batch Year" value={student.batchYear ?? "—"} color="text-signal" />
      </div>

      {/* Attendance per subject */}
      <h2 className="font-display text-lg font-semibold text-text-primary mb-3">Attendance by Subject</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {attendance?.subjects?.map((s) => (
          <Card key={s.courseId} className="flex items-center gap-4 p-5">
            <AttendanceRing percentage={s.percentage} size={68} stroke={6} />
            <div className="min-w-0">
              <p className="font-semibold text-text-primary truncate text-sm">{s.courseName}</p>
              <p className="text-xs text-text-muted mt-0.5">{s.attended} / {s.total} classes</p>
              {s.percentage < 65 && (
                <p className="text-xs text-danger font-medium mt-1">⚠ Chronic absentee</p>
              )}
            </div>
          </Card>
        ))}
        {!attendance?.subjects?.length && (
          <p className="text-text-muted text-sm">No attendance records.</p>
        )}
      </div>

      {/* Marks */}
      {Object.keys(marksByCourse).length > 0 && (
        <>
          <h2 className="font-display text-lg font-semibold text-text-primary mb-3">Assessment Marks</h2>
          <div className="space-y-4">
            {Object.entries(marksByCourse).map(([courseId, entries]) => {
              const totalObtained = entries.reduce((s, e) => s + (e.marksObtained ?? 0), 0);
              const totalMax      = entries.reduce((s, e) => s + (e.assessmentId?.maxMarks ?? 0), 0);
              return (
                <Card key={courseId} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-text-primary text-sm font-mono">{courseId}</p>
                    {totalMax > 0 && (
                      <span className="text-xs text-text-muted">{totalObtained} / {totalMax} total</span>
                    )}
                  </div>
                  <div className="divide-y divide-border">
                    {entries.map((m) => (
                      <div key={m._id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-text-primary">{m.assessmentId?.title || m.assessmentId?.type || "Assessment"}</p>
                          <p className="text-xs text-text-muted">{m.assessmentId?.type}</p>
                        </div>
                        {m.isAbsent ? (
                          <Badge status="absent">AB</Badge>
                        ) : m.marksObtained == null ? (
                          <span className="text-xs text-text-muted">—</span>
                        ) : (
                          <span className="font-display font-bold text-sm text-text-primary">
                            {m.marksObtained}<span className="text-text-muted font-normal text-xs"> / {m.assessmentId?.maxMarks ?? "?"}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}

function InfoChip({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/15 rounded-pill px-3 py-1">
      <Icon size={11} className="opacity-70" />
      <span className="text-xs text-white/80 truncate max-w-[160px]">{text}</span>
    </div>
  );
}

function MiniStat({ label, value, color, icon }) {
  return (
    <Card className="p-4 text-center">
      {icon && <div className="flex justify-center mb-1">{icon}</div>}
      <p className={`font-display text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </Card>
  );
}
