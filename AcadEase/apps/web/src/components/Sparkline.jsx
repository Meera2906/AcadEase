import React from 'react';
import Chart from 'react-apexcharts';

export default function Sparkline({ data = [], color = '#1d4ed8', height = 60 }) {
  const options = {
    chart: { sparkline: { enabled: true }},
    stroke: { curve: 'smooth', width: 2 },
    colors: [color],
    tooltip: { enabled: true }
  };
  const series = [{ data }];
  return (
    <div className="inline-block">
      <Chart options={options} series={series} type="area" height={height} width={150} />
    </div>
  );
}
