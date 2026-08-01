import React from 'react';
import { universityAnalyticsExtended, collegesExtended } from '../data/analyticsDataExtended';
import EnhancedAnalyticsCard from '../components/EnhancedAnalyticsCard';
import Sparkline from '../components/Sparkline';
import PerformanceChart from '../components/PerformanceChart';
import AchievementCard from '../components/AchievementCard';

function CircularProgress({ value = 0, size = 84 }) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <circle r={radius} fill="transparent" stroke="#eef2ff" strokeWidth={stroke} />
        <circle r={radius} fill="transparent" stroke="#6366f1" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} transform={`rotate(-90)`} />
        <text x="0" y="4" textAnchor="middle" fontSize="12" fill="#111827">{value}%</text>
      </g>
    </svg>
  );
}

export default function SuperAdminAnalyticsV2() {
  const uni = universityAnalyticsExtended;
  const topCols = collegesExtended.slice(0, 6);

  const passSeries = [{ name: 'Pass %', data: collegesExtended.map(c => c.passPercentage) }];
  const passCategories = collegesExtended.map(c => c.name);

  const trendSeries = [
    { name: 'Admissions', data: uni.monthlyAdmissions },
  ];
  const trendCategories = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="p-6 space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white rounded-2xl p-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">University Analytics</h1>
          <p className="mt-2 text-indigo-100">Academic Year: {uni.academicYear} • {uni.universityName}</p>
          <div className="mt-4 flex flex-wrap gap-4">
            <div className="px-3 py-2 bg-white/10 rounded-lg">Total Colleges: <strong>{uni.totalColleges}</strong></div>
            <div className="px-3 py-2 bg-white/10 rounded-lg">Students: <strong>{uni.totalStudents.toLocaleString()}</strong></div>
            <div className="px-3 py-2 bg-white/10 rounded-lg">Placement Rate: <strong>{uni.placementRate}%</strong></div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-sm text-indigo-100">Overall Pass</div>
            <div className="text-3xl font-bold">{uni.passPercentage}%</div>
          </div>
          <div>
            <CircularProgress value={Math.round(uni.passPercentage)} />
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <EnhancedAnalyticsCard title="Total Students" value={uni.totalStudents} delta={3.2} />
        <EnhancedAnalyticsCard title="Total Faculty" value={uni.totalFaculty} delta={1.1} />
        <EnhancedAnalyticsCard title="Avg CGPA" value={uni.averageCGPA} delta={0.8} />
        <EnhancedAnalyticsCard title="Placement Rate" value={`${uni.placementRate}%`} delta={2.4} />
      </div>

      {/* Top colleges strip */}
      <div>
        <h2 className="text-lg font-medium mb-3">Top Colleges (Preview)</h2>
        <div className="flex gap-3 overflow-x-auto py-2">
          {topCols.map(col => (
            <div key={col.id} className="min-w-[260px] bg-white rounded-xl p-4 shadow-md border border-gray-100">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-gray-500">{col.name}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{col.location}</div>
                  <div className="mt-2 text-sm text-gray-600">Students: <strong>{col.students}</strong></div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Pass</div>
                  <div className="text-xl font-bold text-green-600">{col.passPercentage}%</div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-gray-500">Recent Trend</div>
                <Sparkline data={col.yearlyPerformance.map(y => y.pass)} color="#10b981" />
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-gray-500">Avg CGPA</div>
                <div className="text-sm font-semibold">{col.averageCGPA}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-medium">College Pass % Comparison</h3>
              <div className="text-sm text-gray-500">Top colleges across region</div>
            </div>
            <PerformanceChart type="bar" series={[{ name: 'Pass %', data: topCols.map(c => c.passPercentage) }]} categories={topCols.map(c => c.name)} height={320} />
          </div>
        </div>

        <div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-md font-medium">Admissions Trend</h3>
            <div className="mt-3">
              <PerformanceChart type="line" series={trendSeries} categories={trendCategories} height={240} />
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 mt-4 shadow-sm">
            <h3 className="text-md font-medium">Arrear Distribution</h3>
            <div className="mt-3">
              <PerformanceChart type="pie" series={[{ name: 'Arrear', data: [uni.arrearRate, +(100 - uni.arrearRate).toFixed(1)] }]} categories={["Arrear","No Arrear"]} height={240} />
            </div>
          </div>
        </div>
      </div>

      {/* Exam readiness & achievements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-md font-medium mb-3">Exam Readiness</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-4">
              <CircularProgress value={(uni.examStatus.hallTicketGeneration.completed / uni.examStatus.hallTicketGeneration.total) * 100} />
              <div>
                <div className="text-sm text-gray-500">Hall Ticket Generation</div>
                <div className="text-lg font-semibold">{uni.examStatus.hallTicketGeneration.completed}/{uni.examStatus.hallTicketGeneration.total}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <CircularProgress value={(uni.examStatus.evaluatorAssignment.completed / uni.examStatus.evaluatorAssignment.total) * 100} />
              <div>
                <div className="text-sm text-gray-500">Evaluator Assignment</div>
                <div className="text-lg font-semibold">{uni.examStatus.evaluatorAssignment.completed}/{uni.examStatus.evaluatorAssignment.total}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <CircularProgress value={(uni.examStatus.answerScriptDispatch.completed / uni.examStatus.answerScriptDispatch.total) * 100} />
              <div>
                <div className="text-sm text-gray-500">Answer Script Dispatch</div>
                <div className="text-lg font-semibold">{uni.examStatus.answerScriptDispatch.completed}/{uni.examStatus.answerScriptDispatch.total}</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <AchievementCard title="Recent Achievements" items={["Smart India Hackathon Winner 2026","AI Research Grant 2025","Top Admissions Milestone"]} />
        </div>
      </div>

    </div>
  );
}
