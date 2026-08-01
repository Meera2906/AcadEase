import React from 'react';
import Chart from 'react-apexcharts';

export default function PerformanceChart({ type = 'bar', series = [], categories = [], height = 300 }) {
  const options = {
    chart: { id: 'perf-chart', toolbar: { show: false } },
    xaxis: { categories },
    colors: ['#1d4ed8', '#10b981', '#f59e0b'],
    stroke: { curve: 'smooth' },
    legend: { position: 'top' }
  };

  return (
    <div className="bg-white shadow-sm rounded-lg p-4">
      <Chart options={options} series={series} type={type} height={height} />
    </div>
  );
}
