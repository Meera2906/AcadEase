import Chart from "react-apexcharts";

export default function RadialProgressCard({ percentage = 0, label = "Attendance", asOf = "" }) {
  const pct = Math.max(0, Math.min(100, percentage));
  const fillColor = pct < 75 ? "#FF4D5E" : pct < 85 ? "#FFB020" : "#1FAF6A";

  const options = {
    chart: { type: "radialBar", sparkline: { enabled: true } },
    plotOptions: {
      radialBar: {
        startAngle: -90,
        endAngle: 227,
        hollow: { margin: 0, size: "65%", background: "transparent" },
        track: { background: "#E7E3D8", strokeWidth: "97%", margin: 0, dropShadow: { enabled: false } },
        dataLabels: { show: false },
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: "dark",
        type: "horizontal",
        shadeIntensity: 0.4,
        gradientToColors: [fillColor],
        inverseColors: false,
        opacityFrom: 1,
        opacityTo: 1,
        stops: [0, 100],
      },
    },
    stroke: { lineCap: "round" },
    colors: [fillColor],
  };

  return (
    <div className="bg-white rounded-card shadow-card border border-border p-3">
      <div className="text-zinc-700 text-[13px] font-semibold mb-1">Overall Attendance</div>
      <div className="flex items-center justify-center w-full overflow-hidden">
        <div className="relative w-[200px] h-[200px]">
          <Chart options={options} series={[pct]} type="radialBar" height={200} width={200} />
          <div className="absolute inset-0 flex items-center justify-center text-center pointer-events-none">
            <div>
              <div className="text-4xl font-bold" style={{ color: fillColor }}>{pct}%</div>
              <div className="text-xs font-medium text-slate-500 mt-0.5">{label}</div>
              {asOf && <div className="text-[10px] text-slate-400 mt-0.5">{asOf}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
