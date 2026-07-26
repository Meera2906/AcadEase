export default function ProgressBar({ percentage }) {
  const pct = Math.max(0, Math.min(100, percentage));
  const color = pct < 75 ? "bg-danger" : pct < 85 ? "bg-warning" : "bg-teal";

  return (
    <div className="w-full">
      <div className="h-2 w-full bg-[#EFEBDF] rounded-pill overflow-hidden">
        <div className={`h-full ${color} rounded-pill transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
