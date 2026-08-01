import React, { useEffect, useState } from 'react';

// Enhanced KPI card with small animated counter and delta indicator
export default function EnhancedAnalyticsCard({ title, value, delta, unit = '', className = '' }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Simple animated counter
    let start = 0;
    const end = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
    const duration = 700;
    const stepTime = Math.max(10, Math.floor(duration / (end || 1)));
    const timer = setInterval(() => {
      start += Math.max(1, Math.round(end / (duration / stepTime)));
      if (start >= end) {
        start = end;
        clearInterval(timer);
      }
      setCount(start);
    }, stepTime);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className={`bg-gradient-to-br from-white to-gray-50 border border-gray-100 rounded-2xl p-4 shadow-md ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">{title}</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{typeof value === 'number' ? count.toLocaleString() + (unit ? ` ${unit}` : '') : value}</div>
          {delta !== undefined && (
            <div className={`mt-1 text-sm ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</div>
          )}
        </div>
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center shadow-sm">
            {/* subtle icon placeholder */}
            <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v4a1 1 0 001 1h3m10 0h3a1 1 0 001-1V7M7 21h10M7 3h10v4H7z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
