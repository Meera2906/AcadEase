import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function CollegePerformanceTable({ data = [] }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white shadow-sm rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Rank</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">College</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Location</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Students</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Pass %</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Arrear %</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">CGPA</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Placement %</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Score</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((col, idx) => (
            <tr key={col.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/superadmin/analytics/college/${col.id}`)}>
              <td className="px-4 py-3 text-sm text-gray-700">{idx + 1}</td>
              <td className="px-4 py-3 text-sm text-gray-900">{col.name}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{col.location}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-700">{col.students.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-700">{col.passPercentage}%</td>
              <td className="px-4 py-3 text-sm text-right text-gray-700">{col.arrearRate}%</td>
              <td className="px-4 py-3 text-sm text-right text-gray-700">{col.averageCGPA}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-700">{col.placementRate}%</td>
              <td className="px-4 py-3 text-sm text-right text-gray-700">{Math.round((col.passPercentage || 0) * 1.2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
