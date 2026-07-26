import { useState } from "react";

export default function CourseCarousel({ subjects = [] }) {
  const [active, setActive] = useState(0);

  if (!subjects || subjects.length === 0) {
    return (
      <div className="w-full py-4 text-center text-xs text-gray-400">No courses available.</div>
    );
  }

  const s = subjects[active];
  const pct = s?.percentage ?? 0;
  const ringColor = pct < 75 ? "#FF4D5E" : pct < 85 ? "#FFB020" : "#1FAF6A";
  const conic = `conic-gradient(${ringColor} ${pct * 3.6}deg, #E7E3D8 0deg)`;

  return (
    <div className="w-full pt-1 pb-1">
      {/* Active course card */}
      <div className="flex items-center gap-3 bg-paper rounded-xl p-3 border border-border">
        {/* Conic ring */}
        <div className="flex-shrink-0 relative w-11 h-11 rounded-full" style={{ background: conic }}>
          <div className="absolute inset-[4px] bg-white rounded-full flex items-center justify-center">
            <span className="text-[9px] font-bold text-zinc-600">{pct}%</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-text-primary leading-tight line-clamp-2">{s.courseName}</p>
          <p className="text-[10px] text-text-muted mt-0.5">{s.courseId} · {s.attended}/{s.total} classes</p>
        </div>
      </div>

      {/* Dot nav */}
      {subjects.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {subjects.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`rounded-full transition-all ${
                i === active ? "w-4 h-1.5 bg-signal" : "w-1.5 h-1.5 bg-border hover:bg-text-muted"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
