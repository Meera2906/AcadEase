import React from 'react';

// Reusable KPI card similar to existing StatCard design
export default function AnalyticsCard({ title, value, subtitle, className = '' }) {
  return (
    <div className={`bg-white shadow-sm rounded-lg p-4 flex flex-col ${className}`}>
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {subtitle && <div className="mt-1 text-xs text-gray-500">{subtitle}</div>}
    </div>
  );
}
