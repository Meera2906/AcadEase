export default function StatCard({ icon: Icon, label, value, gradient = "bg-ink-fade", sub, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`${gradient} rounded-card p-5 text-white shadow-card ${onClick ? "cursor-pointer hover:shadow-lift transition-shadow" : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-pill bg-white/15 flex items-center justify-center">
          <Icon size={18} />
        </div>
      </div>
      <p className="font-display text-3xl font-bold mb-0.5">{value ?? "—"}</p>
      <p className="text-sm font-medium opacity-90">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}
