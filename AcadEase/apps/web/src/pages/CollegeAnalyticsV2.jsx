import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collegesExtended } from '../data/analyticsDataExtended';
import EnhancedAnalyticsCard from '../components/EnhancedAnalyticsCard';
import PerformanceChart from '../components/PerformanceChart';
import Sparkline from '../components/Sparkline';
import AchievementCard from '../components/AchievementCard';

// Helper to ensure numeric values and fallback
function toNumber(v, fallback = 0) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v.replace(/[^0-9.-]/g, '')) || fallback;
  return fallback;
}

export default function CollegeAnalyticsV2() {
  const { id } = useParams();
  const navigate = useNavigate();
  const college = collegesExtended.find(c => c.id === id) || collegesExtended[0];

  // normalize some values
  const pass = toNumber(college.passPercentage, 0);
  const arrear = toNumber(college.arrearRate, 0);
  const cgpa = toNumber(college.averageCGPA, 0);
  const placement = toNumber(college.placementRate, 0);

  const deptCategories = college.departments.map(d => d.name);
  const deptPassSeries = [{ name: 'Pass %', data: college.departments.map(d => toNumber(d.passPercentage)) }];

  const yearlyCategories = college.yearlyPerformance.map(y => String(y.year));
  const yearlySeries = [
    { name: 'Pass %', data: college.yearlyPerformance.map(y => toNumber(y.pass)) },
    { name: 'Avg CGPA', data: college.yearlyPerformance.map(y => toNumber(y.cgpa)) }
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{college.name}</h1>
          <div className="text-sm text-gray-500 mt-1">{college.location} • Established {college.established} • {college.type}</div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="px-3 py-2 bg-white border rounded shadow-sm">Back</button>
          <div className="text-right">
            <div className="text-xs text-gray-500">Pass Rate</div>
            <div className="text-xl font-bold text-green-600">{pass}%</div>
          </div>
        </div>
      </div>

      {/* Overview cards responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <EnhancedAnalyticsCard title="Total Students" value={college.students} />
        <EnhancedAnalyticsCard title="Total Faculty" value={college.faculty} />
        <EnhancedAnalyticsCard title="Student-Faculty Ratio" value={college.studentFacultyRatio} />
        <EnhancedAnalyticsCard title="Established" value={college.established} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <EnhancedAnalyticsCard title="Pass %" value={`${pass}%`} delta={+(pass - 2).toFixed(1)} />
            <EnhancedAnalyticsCard title="Arrear %" value={`${arrear}%`} delta={-(arrear - 1).toFixed(1)} />
            <EnhancedAnalyticsCard title="Avg CGPA" value={cgpa} delta={+(cgpa - 0.1).toFixed(2)} />
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-md font-medium mb-3">Department-wise Performance</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Department</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Students</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Pass %</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Arrear %</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">CGPA</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Placement %</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {college.departments.map((d, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-sm text-gray-900">{d.name}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{d.students.toLocaleString ? d.students.toLocaleString() : d.students}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{toNumber(d.passPercentage)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{toNumber(d.arrear)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{toNumber(d.cgpa)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{toNumber(d.placement)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h4 className="text-sm text-gray-500">Year-wise Performance</h4>
              <PerformanceChart type="line" series={yearlySeries} categories={yearlyCategories} height={240} />
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h4 className="text-sm text-gray-500">Department Pass Rates</h4>
              <PerformanceChart type="bar" series={deptPassSeries} categories={deptCategories} height={240} />
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h4 className="text-sm text-gray-500 mb-2">Faculty Statistics</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-gray-500">Total Faculty</div>
                <div className="text-lg font-semibold">{college.faculty}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">PhD Faculty</div>
                <div className="text-lg font-semibold">{Math.round(college.faculty * 0.18)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Industry Certified</div>
                <div className="text-lg font-semibold">{Math.round(college.faculty * 0.45)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Avg Experience</div>
                <div className="text-lg font-semibold">{(5 + (college.faculty % 10)).toFixed(1)} yrs</div>
              </div>
            </div>
          </div>

          <AchievementCard title="Achievements & Research" items={college.achievements} />

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h4 className="text-sm text-gray-500">Grievances</h4>
            <div className="mt-2 text-sm text-gray-700">
              <div>Total: {college.grievanceStats.total}</div>
              <div>Resolved: {college.grievanceStats.resolved}</div>
              <div>Pending: {college.grievanceStats.pending}</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
