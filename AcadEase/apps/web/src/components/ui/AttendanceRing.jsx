export default function AttendanceRing({ percentage, size = 88, stroke = 8, label, dark = false }) {
  const pct = Math.max(0, Math.min(100, percentage));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const color = pct < 75 ? "#FF4D5E" : pct < 85 ? "#FFB020" : "#C6FF4D";
  const track = dark ? "rgba(255,255,255,0.12)" : "#EFEBDF";
  const textColor = dark ? "#FFFFFF" : "#14162B";

  return (
    <div className="relative inline-flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-lg leading-none" style={{ color: textColor }}>
          {pct}%
        </span>
        {label && <span className={`text-[10px] mt-0.5 ${dark ? "text-white/60" : "text-text-muted"}`}>{label}</span>}
      </div>
    </div>
  );
}
