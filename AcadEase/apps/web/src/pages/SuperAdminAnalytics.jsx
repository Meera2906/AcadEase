import React from 'react';
import AnalyticsCard from '../components/AnalyticsCard';
import CollegePerformanceTable from '../components/CollegePerformanceTable';
import PerformanceChart from '../components/PerformanceChart';
import AchievementCard from '../components/AchievementCard';
import { universityAnalytics, colleges } from '../data/analyticsData';
import ProgressBar from '../components/ui/ProgressBar';

export default function SuperAdminAnalytics() {
  const topColleges = colleges.slice(0, 10);

  const passSeries = [{ name: 'Pass %', data: colleges.map(c => c.passPercentage) }];
  const passCategories = colleges.map(c => c.name);

  const arrearSeries = [{ name: 'Arrear', data: colleges.map(c => c.arrearRate) }];
  const arrearCategories = colleges.map(c => c.name);

  const trendSeries = [
    { name: 'Pass %', data: [universityAnalytics.passPercentage - 2, universityAnalytics.passPercentage - 1, universityAnalytics.passPercentage] },
    { name: 'Avg CGPA', data: [universityAnalytics.averageCGPA - 0.2, universityAnalytics.averageCGPA - 0.1, universityAnalytics.averageCGPA] }
  ];
  const trendCategories = ['2023', '2024', '2025'];

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">University Analytics Dashboard</h1>
          <div className="text-sm text-gray-500">Academic Year: {universityAnalytics.academicYear}</div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <AnalyticsCard title="Total Colleges" value={universityAnalytics.totalColleges} />
        <AnalyticsCard title="Students" value={universityAnalytics.totalStudents.toLocaleString()} />
        <AnalyticsCard title="Faculty" value={universityAnalytics.totalFaculty.toLocaleString()} />
        <AnalyticsCard title="Overall Pass %" value={`${universityAnalytics.passPercentage}%`} />
        <AnalyticsCard title="Arrear Rate" value={`${universityAnalytics.arrearRate}%`} />
        <AnalyticsCard title="Average CGPA" value={universityAnalytics.averageCGPA} />
        <AnalyticsCard title="Placement Rate" value={`${universityAnalytics.placementRate}%`} />
        <AnalyticsCard title="Achievements" value={universityAnalytics.achievements} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">College Performance Ranking</h2>
            <div className="text-sm text-gray-500">Top performing affiliated colleges</div>
          </div>
          <CollegePerformanceTable data={topColleges} />
        </div>

        <aside className="space-y-4">
          <AchievementCard title="University Achievements" items={["Smart India Hackathon Winner 2026","Best Industry Collaboration Award","Top Research Grant 2025"]} />

          <div className="bg-white shadow-sm rounded-lg p-4">
            <h3 className="text-sm text-gray-500">Exam Readiness Tracker</h3>
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between text-sm text-gray-700"><span>Hall Ticket Generation</span><span>{universityAnalytics.examStatus.hallTicketGeneration.completed}/{universityAnalytics.examStatus.hallTicketGeneration.total}</span></div>
                <ProgressBar value={(universityAnalytics.examStatus.hallTicketGeneration.completed / universityAnalytics.examStatus.hallTicketGeneration.total) * 100} />
              </div>
              <div>
                <div className="flex justify-between text-sm text-gray-700"><span>Evaluator Assignment</span><span>{universityAnalytics.examStatus.evaluatorAssignment.completed}/{universityAnalytics.examStatus.evaluatorAssignment.total}</span></div>
                <ProgressBar value={(universityAnalytics.examStatus.evaluatorAssignment.completed / universityAnalytics.examStatus.evaluatorAssignment.total) * 100} />
              </div>
              <div>
                <div className="flex justify-between text-sm text-gray-700"><span>Answer Script Dispatch</span><span>{universityAnalytics.examStatus.answerScriptDispatch.completed}/{universityAnalytics.examStatus.answerScriptDispatch.total}</span></div>
                <ProgressBar value={(universityAnalytics.examStatus.answerScriptDispatch.completed / universityAnalytics.examStatus.answerScriptDispatch.total) * 100} />
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PerformanceChart type="bar" series={passSeries} categories={passCategories} height={320} />
        <PerformanceChart type="pie" series={[{ name: 'Arrear', data: [universityAnalytics.arrearRate, 100 - universityAnalytics.arrearRate] }]} categories={["Arrear", "No Arrear"]} height={320} />
        <PerformanceChart type="line" series={trendSeries} categories={trendCategories} height={320} />
      </section>

    </div>
  );
}
