import { useNavigate } from "react-router-dom";

export default function ProfileCard({ user, stats, xp }) {
  const navigate = useNavigate();

  const initials = (user?.name || "")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const enrolledCourses = stats?.subjects?.length ?? 0;
  const aboveThreshold = stats?.subjects?.filter((s) => s.percentage >= 75)?.length ?? 0;
  const totalXp = xp?.totalXp ?? 0;
  const streak = xp?.streak ?? 0;

  const statItems = [
    { label: "Subjects", value: enrolledCourses, iconColor: "text-violet-600", iconBg: "bg-violet-100", border: "border-violet-100", bg: "bg-violet-50",
      icon: <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="22" width="22"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
    },
    { label: "Above 75%", value: aboveThreshold, iconColor: "text-emerald-600", iconBg: "bg-emerald-100", border: "border-emerald-100", bg: "bg-emerald-50",
      icon: <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="22" width="22"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    { label: "Academic XP", value: totalXp, iconColor: "text-amber-600", iconBg: "bg-amber-100", border: "border-amber-100", bg: "bg-amber-50",
      icon: <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="22" width="22"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    },
    { label: "Day Streak", value: streak, iconColor: "text-rose-600", iconBg: "bg-rose-100", border: "border-rose-100", bg: "bg-rose-50",
      icon: <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="22" width="22"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>,
    },
  ];

  return (
    <div className="grid grid-cols-12 bg-white shadow-card border border-border rounded-card gap-4 h-full p-4">
      {/* Avatar + identity */}
      <div
        className="col-span-5 flex flex-col items-center justify-center rounded-xl overflow-hidden relative cursor-pointer"
        style={{ background: "linear-gradient(135deg, #14162B 0%, #232744 55%, #2B2F52 100%)" }}
        onClick={() => navigate("/student/profile")}
      >
        <div
          className="absolute top-0 left-0 right-0 h-24 z-0"
          style={{ background: "linear-gradient(120deg, #3654FF 0%, #C6FF4D 100%)", clipPath: "polygon(0 0, 100% 0, 100% 55%, 0 100%)" }}
        />
        <div className="relative z-10 flex flex-col items-center p-4 w-full">
          <div className="w-16 h-16 rounded-full border-[3px] border-white bg-ink-light overflow-hidden mb-2 flex items-center justify-center shadow-lift">
            <span className="text-xl font-bold text-white">{initials}</span>
          </div>
          <p className="text-white font-bold text-sm mb-0.5 text-center leading-tight">{user?.name}</p>
          <p className="text-citrus text-[11px] font-mono mb-0.5">{user?.userId}</p>
          <p className="text-white/50 text-[10px]">
            Sem {user?.semester} · Sec {user?.section} · {user?.batchYear}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="col-span-7 grid grid-cols-2 gap-2.5">
        {statItems.map((item) => (
          <div
            key={item.label}
            className={`rounded-xl p-2.5 flex flex-col items-center justify-center gap-1.5 border ${item.bg} ${item.border}`}
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${item.iconBg}`}>
              <div className={item.iconColor}>{item.icon}</div>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-[10px] font-medium leading-tight">{item.label}</p>
              <p className="text-zinc-800 font-bold text-lg tabular-nums leading-none mt-0.5">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
