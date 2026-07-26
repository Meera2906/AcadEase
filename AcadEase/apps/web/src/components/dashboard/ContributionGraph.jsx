export default function ContributionGraph({ events = [] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build 364-day grid
  const days = [];
  for (let i = 363; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }

  // Aggregate XP points per day
  const dateActivity = {};
  events.forEach((e) => {
    const key = e.date?.slice(0, 10) || e.createdAt?.slice(0, 10);
    if (key) dateActivity[key] = (dateActivity[key] || 0) + (e.points || 1);
  });

  const getIntensity = (key) => {
    const val = dateActivity[key];
    if (!val) return 0;
    if (val < 10) return 1;
    if (val < 20) return 2;
    if (val < 35) return 3;
    return 4;
  };

  // Citrus-toned intensity scale matching design tokens
  const colors = [
    "bg-border",          // 0 — inactive
    "bg-citrus/30",       // 1 — low
    "bg-citrus/55",       // 2 — medium
    "bg-citrus/80",       // 3 — high
    "bg-citrus",          // 4 — peak
  ];

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // Month labels
  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const m = week[0]?.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ index: wi, label: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m] });
      lastMonth = m;
    }
  });

  const totalActive = Object.keys(dateActivity).length;

  return (
    <div className="bg-white border border-border rounded-card shadow-card px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-text-primary">
          Learning Progress Overview
          <span className="ml-2 text-xs font-normal text-text-muted">{totalActive} active days this year</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Less</span>
          <div className="flex gap-1">
            {colors.map((c, i) => (
              <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>

      {/* Month labels */}
      <div className="relative mb-1 overflow-auto">
        <div className="flex gap-[3px]" style={{ minWidth: "max-content" }}>
          {weeks.map((_, wi) => {
            const label = monthLabels.find((m) => m.index === wi);
            return (
              <div key={wi} className="w-3 text-[9px] text-text-muted text-center leading-none">
                {label ? label.label : ""}
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-auto pb-1">
        <div className="flex gap-[3px]" style={{ minWidth: "max-content" }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((d) => {
                const key = d.toISOString().slice(0, 10);
                const intensity = getIntensity(key);
                const pts = dateActivity[key] || 0;
                return (
                  <div
                    key={key}
                    title={pts ? `${key}: ${pts} XP` : key}
                    className={`w-3 h-3 rounded-sm cursor-default ${colors[intensity]}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
