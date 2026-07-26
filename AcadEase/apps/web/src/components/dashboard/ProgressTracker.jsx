import { useState } from "react";

const TABS = [
  { key: "IA1", label: "IA 1" },
  { key: "IA2", label: "IA 2" },
  { key: "Assignment", label: "Assignment" },
  { key: "Lab Record", label: "Lab" },
];

export default function ProgressTracker({ marks = [] }) {
  const [activeTab, setActiveTab] = useState("IA1");

  const filtered = marks.filter(
    (m) => m.assessmentId?.type === activeTab && !m.isAbsent && m.marksObtained != null
  );

  const attempted = filtered.length;
  const submitted = filtered.filter((m) => m.marksObtained > 0).length;
  const totalScore = filtered.reduce((s, m) => s + m.marksObtained, 0);
  const totalMax = filtered.reduce((s, m) => s + (m.assessmentId?.maxMarks ?? 0), 0);
  const accuracy = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  const statItems = [
    {
      label: "Attempted",
      value: attempted,
      stroke: "#6366f1",
      icon: (
        <svg viewBox="0 0 40 40" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="8" width="30" height="24" rx="3" stroke="#6366f1" />
          <circle cx="20" cy="20" r="4" stroke="#6366f1" />
          <path d="M14 28c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#6366f1" />
        </svg>
      ),
    },
    {
      label: "Submitted",
      value: submitted,
      stroke: "#22c55e",
      icon: (
        <svg viewBox="0 0 40 40" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 20l6 6 14-14" stroke="#22c55e" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20" cy="20" r="14" stroke="#22c55e" />
        </svg>
      ),
    },
    {
      label: "Total Score",
      value: totalMax > 0 ? `${totalScore}/${totalMax}` : "—",
      stroke: "#f59e0b",
      icon: (
        <svg viewBox="0 0 40 40" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M20 4L24 14H34L26 20L29 30L20 24L11 30L14 20L6 14H16L20 4Z" stroke="#f59e0b" fill="#f59e0b" fillOpacity="0.2" />
        </svg>
      ),
    },
    {
      label: "Accuracy",
      value: `${accuracy}%`,
      stroke: "#3b82f6",
      icon: (
        <svg viewBox="0 0 40 40" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="20" cy="20" r="14" stroke="#3b82f6" />
          <path d="M14 20l4 4 8-8" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="col-span-3 h-full bg-white shadow-card border border-border rounded-card flex flex-col">
      <div className="p-3 flex items-center justify-between">
        <div className="text-zinc-700 text-[13px] font-semibold">Assessment Tracker</div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-full">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-2 py-1 text-[11px] rounded-full transition-all duration-200 ${
                activeTab === tab.key
                  ? "bg-signal text-white"
                  : "text-slate-500 hover:bg-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 pb-3 flex-1">
        <div className="flex gap-2 justify-between">
          {statItems.map((item) => (
            <div key={item.label} className="flex flex-col items-center flex-1">
              <div className="flex items-center mb-0.5 justify-center">{item.icon}</div>
              <div className="text-center text-[10px] text-slate-500">{item.label}</div>
              <h5 className="text-center text-[15px] font-bold text-zinc-700 tabular-nums">{item.value}</h5>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
