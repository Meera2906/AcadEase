import React from 'react';

export default function AchievementCard({ title = 'Achievements', items = [] }) {
  const count = Array.isArray(items) ? items.length : 0;

  return (
    <div className="bg-white shadow-sm rounded-lg p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-gray-500">{title}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{count}</div>
        </div>
        <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
          {count} {count === 1 ? 'achievement' : 'achievements'}
        </div>
      </div>

      {count > 0 ? (
        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-gray-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-gray-500">No achievements available.</p>
      )}
    </div>
  );
}
