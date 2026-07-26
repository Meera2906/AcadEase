import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Flame, Zap, Trophy, TrendingUp,
  CalendarCheck, ClipboardList, FileBadge, MessageSquareWarning,
  ChevronRight, BookOpen, Clock, Megaphone, X,
} from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import CalendarWidget from "../../components/dashboard/CalendarWidget.jsx";
import ContributionGraph from "../../components/dashboard/ContributionGraph.jsx";
import ProfileCard from "../../components/dashboard/ProfileCard.jsx";
import RadialProgressCard from "../../components/dashboard/RadialProgressCard.jsx";
import CourseCarousel from "../../components/dashboard/CourseCarousel.jsx";
import ProgressTracker from "../../components/dashboard/ProgressTracker.jsx";
import ProblemsChart from "../../components/dashboard/ProblemsChart.jsx";
import ExploreCourses from "../../components/dashboard/ExploreCourses.jsx";

// ── Attendance progress bar (PRD 3.3 colour rules) ──────────────────────────
function AttendanceBar({ pct }) {
  const color = pct < 75 ? "bg-danger" : pct < 85 ? "bg-warning" : "bg-success";
  return (
    <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ── Subject attendance card ──────────────────────────────────────────────────
function SubjectCard({ subject }) {
  const pct = subject.percentage ?? 0;
  const textColor = pct < 75 ? "text-danger" : pct < 85 ? "text-warning" : "text-success";
  const needed = pct < 75 && subject.total > 0
    ? Math.max(0, Math.ceil(0.75 * (subject.total + 10) - subject.attended))
    : null;

  return (
    <div className="bg-white border border-border rounded-card p-4 shadow-card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text-primary leading-tight">{subject.courseName}</p>
          <p className="text-xs text-text-muted mt-0.5">{subject.courseId}</p>
        </div>
        <span className={`text-xl font-bold tabular-nums ${textColor}`}>{pct}%</span>
      </div>
      <AttendanceBar pct={pct} />
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>{subject.attended}/{subject.total} classes</span>
        {needed !== null && (
          <span className="text-danger font-medium">Need {needed} more</span>
        )}
      </div>
    </div>
  );
}

// ── Quick action tile ────────────────────────────────────────────────────────
function ActionTile({ icon: Icon, label, to, color }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="bg-white border border-border rounded-card p-4 shadow-card flex flex-col items-center gap-2 hover:shadow-lift hover:-translate-y-0.5 transition-all group"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <span className="text-xs font-semibold text-text-secondary group-hover:text-text-primary transition-colors">{label}</span>
    </button>
  );
}

// ── Marks row ────────────────────────────────────────────────────────────────
function MarksRow({ mark }) {
  const pct = mark.assessmentId?.maxMarks
    ? Math.round((mark.marksObtained / mark.assessmentId.maxMarks) * 100)
    : null;
  const color = pct === null ? "text-text-muted" : pct >= 85 ? "text-success" : pct >= 60 ? "text-warning" : "text-danger";

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{mark.assessmentId?.title || "Assessment"}</p>
        <p className="text-xs text-text-muted">{mark.assessmentId?.type} · {mark.courseId}</p>
      </div>
      <div className="text-right shrink-0 ml-3">
        <span className={`text-sm font-bold tabular-nums ${color}`}>
          {mark.isAbsent ? "AB" : `${mark.marksObtained}/${mark.assessmentId?.maxMarks ?? "—"}`}
        </span>
        {pct !== null && <p className="text-xs text-text-muted">{pct}%</p>}
      </div>
    </div>
  );
}

// ── Leaderboard row ──────────────────────────────────────────────────────────
function LeaderboardRow({ entry, rank, isMe }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isMe ? "bg-signal/10 border border-signal/20" : "hover:bg-paper"}`}>
      <span className="w-6 text-center text-sm font-bold text-text-muted tabular-nums">
        {medal || `#${rank}`}
      </span>
      <span className={`flex-1 text-sm font-medium truncate ${isMe ? "text-signal font-semibold" : "text-text-primary"}`}>
        {entry.name}{isMe ? " (you)" : ""}
      </span>
      <span className="text-xs font-bold text-citrus bg-ink px-2 py-0.5 rounded-pill tabular-nums">
        {entry.totalXp} XP
      </span>
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [xp, setXp] = useState(null);
  const [marks, setMarks] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [dismissedAnns, setDismissedAnns] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get(`/attendance/student/${user.userId}/summary`),
      api.get(`/gamification/xp/${user.userId}`),
      api.get(`/marks/student/${user.userId}`).catch(() => ({ data: { marks: [] } })),
      api.get("/gamification/leaderboard").catch(() => ({ data: { leaderboard: [] } })),
      api.get("/assessments/mine").catch(() => ({ data: { assessments: [] } })),
      api.get(`/attendance/today-schedule/${user.userId}`).catch(() => ({ data: null })),
      api.get("/announcements").catch(() => ({ data: { announcements: [] } })),
    ]).then(([s, x, m, lb, a, ts, anns]) => {
      setSummary(s.data);
      setXp(x.data);
      setMarks(m.data.marks || []);
      setLeaderboard(lb.data.leaderboard || []);
      setAssessments(a.data.assessments || []);
      setTodaySchedule(ts.data);
      setAnnouncements(anns.data.announcements || []);
    }).finally(() => setLoading(false));
  }, [user]);

  const overallPct = summary?.overallPercentage ?? 0;
  const subjects = summary?.subjects || [];
  const belowThreshold = subjects.filter((s) => s.percentage < 75);
  const totalXp = xp?.totalXp ?? 0;
  const streak = xp?.streak ?? 0;
  const level = Math.floor(totalXp / 100) + 1;
  const xpInLevel = totalXp % 100;
  const xpEvents = xp?.events || [];

  const top5 = leaderboard.slice(0, 5);
  const myRank = leaderboard.findIndex((e) => e.studentId === user?.userId) + 1;
  const recentMarks = marks.slice(0, 6);

  const today = new Date();
  const asOfDate = `as on ${today.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][today.getMonth()]} ${today.getFullYear()}`;

  return (
    <AppShell>
      {loading ? (
        <div className="p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="p-4 md:p-6 space-y-5 bg-paper min-h-screen">

          {/* ── Attendance warning banner ── */}
          {belowThreshold.length > 0 && (
            <div className="flex items-start gap-3 bg-danger/10 border border-danger/20 text-danger rounded-card px-4 py-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm font-medium space-y-0.5">
                {belowThreshold.map((s) => {
                  const needed = s.total > 0 ? Math.max(0, Math.ceil(0.75 * (s.total + 10) - s.attended)) : 0;
                  return (
                    <p key={s.courseId}>
                      You're at <strong>{s.percentage}%</strong> in <strong>{s.courseName}</strong> — need {needed} more classes to reach 75%.
                    </p>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Announcements from faculty/admin ── */}
          {announcements.filter((a) => !dismissedAnns.has(a._id)).length > 0 && (
            <div className="space-y-2">
              {announcements.filter((a) => !dismissedAnns.has(a._id)).slice(0, 3).map((ann) => (
                <div key={ann._id} className="bg-signal/5 border border-signal/20 rounded-card p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <Megaphone size={18} className="text-signal mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-text-primary">{ann.title}</p>
                      <p className="text-sm text-text-secondary mt-0.5 line-clamp-2">{ann.body}</p>
                      <p className="text-xs text-text-muted mt-1">
                        {ann.createdBy} · {new Date(ann.createdAt).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <button
                      onClick={() => setDismissedAnns((prev) => new Set(prev).add(ann._id))}
                      className="w-6 h-6 shrink-0 bg-border/30 text-text-muted rounded-lg flex items-center justify-center hover:bg-border hover:text-text-primary transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Row 1: ProfileCard + RadialProgress + XP card + Quick actions ── */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* ProfileCard — spans 5 cols */}
            <div className="md:col-span-5">
              <ProfileCard user={user} stats={summary} xp={xp} />
            </div>

            {/* Radial attendance — 3 cols */}
            <div className="md:col-span-3">
              <RadialProgressCard percentage={overallPct} label="Overall Attendance" asOf={asOfDate} />
            </div>

            {/* XP card + Quick actions stacked — 4 cols */}
            <div className="md:col-span-4 flex flex-col gap-4">
              {/* XP / Level */}
              <div className="bg-ink rounded-card p-4 shadow-card flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-paper/70">Academic XP</p>
                  <span className="flex items-center gap-1 bg-citrus text-ink text-xs font-bold px-2.5 py-1 rounded-pill">
                    <Zap size={12} /> Level {level}
                  </span>
                </div>
                <div className="text-3xl font-bold text-citrus tabular-nums">
                  {totalXp} <span className="text-base text-paper/50">pts</span>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-citrus transition-all" style={{ width: `${xpInLevel}%` }} />
                  </div>
                  <p className="text-[10px] text-paper/50">{xpInLevel}/100 XP to Level {level + 1}</p>
                </div>
                {streak > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Flame size={13} className="text-citrus" />
                    <span className="text-xs text-paper/70 font-medium">{streak}-day attendance streak</span>
                  </div>
                )}
              </div>

              {/* Quick actions 2×2 */}
              <div className="grid grid-cols-2 gap-2.5">
                <ActionTile icon={CalendarCheck} label="Attendance" to="/student/attendance" color="bg-signal" />
                <ActionTile icon={ClipboardList} label="Results" to="/student/results" color="bg-teal" />
                <ActionTile icon={FileBadge} label="Certificates" to="/student/certificates" color="bg-success" />
                <ActionTile icon={MessageSquareWarning} label="Grievances" to="/student/grievances" color="bg-coral" />
              </div>
            </div>
          </div>

          {/* ── Row 2: Today's Schedule ── */}
          {todaySchedule && todaySchedule.schedule?.length > 0 && (
            <div className="bg-white border border-border rounded-card shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-signal" />
                  <h2 className="text-sm font-semibold text-text-primary">Today's Schedule</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-signal bg-signal/10 px-2.5 py-1 rounded-pill">
                    {todaySchedule.dayOrder}
                  </span>
                  <span className="text-xs text-text-muted">{todaySchedule.date}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
                {todaySchedule.schedule.map((slot) => {
                  const statusColors = {
                    present: "border-success/30 bg-success/5",
                    absent:  "border-danger/30 bg-danger/5",
                    od:      "border-signal/30 bg-signal/5",
                    late:    "border-warning/30 bg-warning/5",
                  };
                  const statusDot = {
                    present: "bg-success",
                    absent:  "bg-danger",
                    od:      "bg-signal",
                    late:    "bg-warning",
                  };
                  const statusLabel = {
                    present: "Present",
                    absent:  "Absent",
                    od:      "On Duty",
                    late:    "Late",
                  };
                  const cardStyle = slot.status ? statusColors[slot.status] : "border-border bg-paper/50";
                  return (
                    <div
                      key={slot.courseId + slot.hour}
                      className={`flex flex-col gap-1.5 p-3 rounded-xl border transition-colors ${cardStyle}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-text-muted">{slot.hour}</span>
                        {slot.status && (
                          <span className={`w-2 h-2 rounded-full ${statusDot[slot.status]}`} />
                        )}
                      </div>
                      <p className="text-xs font-semibold text-text-primary leading-tight line-clamp-2">
                        {slot.courseName}
                      </p>
                      <p className="text-[10px] font-mono text-text-muted">{slot.courseId}</p>
                      {slot.status ? (
                        <span className={`text-[10px] font-bold ${
                          slot.status === "present" ? "text-success" :
                          slot.status === "absent"  ? "text-danger"  :
                          slot.status === "od"      ? "text-signal"  : "text-warning"
                        }`}>
                          {statusLabel[slot.status]}
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-muted">Not marked</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Row 3: Subject attendance cards ── */}
          <div>
            <h2 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
              <BookOpen size={15} /> Subject-wise Attendance
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {subjects.map((s) => <SubjectCard key={s.courseId} subject={s} />)}
              {subjects.length === 0 && (
                <p className="text-sm text-text-muted col-span-full text-center py-6">No attendance data yet.</p>
              )}
            </div>
          </div>

          {/* ── Row 4: ProgressTracker + ExploreCourses + CourseCarousel ── */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* ProgressTracker — 7 cols */}
            <div className="md:col-span-7">
              <ProgressTracker marks={marks} />
            </div>

            {/* ExploreCourses — 2 cols */}
            <div className="md:col-span-2">
              <ExploreCourses />
            </div>

            {/* CourseCarousel — 3 cols */}
            <div className="md:col-span-3 bg-white border border-border rounded-card shadow-card p-3">
              <div className="text-zinc-700 text-[13px] font-semibold mb-1">Your Courses</div>
              <CourseCarousel subjects={subjects} />
            </div>
          </div>

          {/* ── Row 5: ProblemsChart (attendance trend) + Calendar ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white border border-border rounded-card shadow-card">
              <ProblemsChart subjects={subjects} />
            </div>
            <div className="lg:col-span-1">
              <CalendarWidget assessments={assessments} />
            </div>
          </div>

          {/* ── Row 6: Learning Progress (contribution graph) ── */}
          <ContributionGraph events={xpEvents} />

          {/* ── Row 7: Recent marks + Leaderboard ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent assessment marks */}
            <div className="bg-white border border-border rounded-card p-5 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <TrendingUp size={15} className="text-signal" /> Recent Assessment Marks
                </h2>
                <button
                  onClick={() => navigate("/student/results")}
                  className="text-xs text-signal font-medium flex items-center gap-0.5 hover:underline"
                >
                  View all <ChevronRight size={13} />
                </button>
              </div>
              <div className="divide-y divide-border">
                {recentMarks.length === 0 && (
                  <p className="text-sm text-text-muted text-center py-6">No marks published yet.</p>
                )}
                {recentMarks.map((m) => <MarksRow key={m._id} mark={m} />)}
              </div>
            </div>

            {/* XP Leaderboard */}
            <div className="bg-white border border-border rounded-card p-5 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Trophy size={15} className="text-warning" /> XP Leaderboard
                </h2>
                {myRank > 5 && (
                  <span className="text-xs text-text-muted">Your rank: <strong className="text-text-primary">#{myRank}</strong></span>
                )}
              </div>
              <div className="space-y-1">
                {top5.length === 0 && (
                  <p className="text-sm text-text-muted text-center py-6">No leaderboard data yet.</p>
                )}
                {top5.map((entry, i) => (
                  <LeaderboardRow
                    key={entry.studentId}
                    entry={entry}
                    rank={i + 1}
                    isMe={entry.studentId === user?.userId}
                  />
                ))}
                {myRank > 5 && (() => {
                  const me = leaderboard[myRank - 1];
                  return me ? (
                    <>
                      <div className="text-center text-xs text-text-muted py-1">· · ·</div>
                      <LeaderboardRow entry={me} rank={myRank} isMe />
                    </>
                  ) : null;
                })()}
              </div>
            </div>
          </div>

        </div>
      )}
    </AppShell>
  );
}
