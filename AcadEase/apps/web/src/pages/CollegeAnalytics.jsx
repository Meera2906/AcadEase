import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { colleges } from '../data/analyticsData';
import AnalyticsCard from '../components/AnalyticsCard';
import PerformanceChart from '../components/PerformanceChart';
import AchievementCard from '../components/AchievementCard';

export default function CollegeAnalytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const college = colleges.find(c => c.id === id) || colleges[0];

  const deptSeries = [{ name: 'Pass %', data: college.departments.map(d => d.passPercentage) }];
  const deptCategories = college.departments.map(d => d.name);

  const yearlySeries = [
    { name: 'Pass %', data: college.yearlyPerformance.map(y => y.pass) },
    { name: 'Avg CGPA', data: college.yearlyPerformance.map(y => y.cgpa) }
  ];
  const yearlyCategories = college.yearlyPerformance.map(y => String(y.year));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{college.name}</h1>
          <div className="text-sm text-gray-500">{college.location} • Established {college.established} • {college.type}</div>
        </div>
        <div>
          <button onClick={() => navigate(-1)} className="px-3 py-2 bg-white border rounded">Back</button>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnalyticsCard title="Total Students" value={college.students.toLocaleString()} />
        <AnalyticsCard title="Faculty" value={college.faculty} />
        <AnalyticsCard title="Student-Faculty Ratio" value={college.studentFacultyRatio} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnalyticsCard title="Pass %" value={`${college.passPercentage}%`} />
        <AnalyticsCard title="Arrear %" value={`${college.arrearRate}%`} />
        <AnalyticsCard title="Avg CGPA" value={college.averageCGPA} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Department-wise Performance</h2>
          <div className="bg-white shadow-sm rounded-lg p-4">
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
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{d.students}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{d.passPercentage}%</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{d.arrear}%</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{d.cgpa}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{d.placement}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-medium">Faculty Statistics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <AnalyticsCard title="Total Faculty" value={college.faculty} />
            <AnalyticsCard title="PhD Faculty" value={Math.round(college.faculty * 0.18)} />
            <AnalyticsCard title="Industry Certified" value={Math.round(college.faculty * 0.45)} />
          </div>

          <h3 className="text-lg font-medium">Research & Achievements</h3>
          <AchievementCard title="Achievements" items={college.achievements} />

        </div>

        <aside className="space-y-4">
          <PerformanceChart type="bar" series={deptSeries} categories={deptCategories} height={260} />
          <PerformanceChart type="line" series={yearlySeries} categories={yearlyCategories} height={260} />

          <div className="bg-white shadow-sm rounded-lg p-4">
            <h4 className="text-sm text-gray-500">Grievance Statistics</h4>
            <div className="mt-3 text-sm text-gray-700">
              <div>Total: {college.grievanceStats.total}</div>
              <div>Resolved: {college.grievanceStats.resolved}</div>
              <div>Pending: {college.grievanceStats.pending}</div>
            </div>
          </div>

        </aside>
      </section>
    </div>
  );
}
