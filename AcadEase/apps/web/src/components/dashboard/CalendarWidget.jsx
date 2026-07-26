import { useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarWidget({ assessments = [] }) {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = now.getDate();
  const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const assessmentDates = new Set();
  assessments.forEach((a) => {
    if (a.startDate) {
      const d = new Date(a.startDate);
      if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
        assessmentDates.add(d.getDate());
      }
    }
  });

  return (
    <div className="relative bg-white rounded-2xl shadow-sm p-4">
      <div className="mb-2 text-zinc-700 text-[14px] font-semibold">
        Track Your Assignments and Assessments
      </div>
      <div className="flex flex-col gap-4 relative">
        {/* Calendar header */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={prevMonth}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            >
              <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" height="18" width="18">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-[13px] font-semibold text-gray-700 tracking-wide">
              {MONTHS[viewMonth]} / {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            >
              <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" height="18" width="18">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-7 text-center mb-1">
            {DAYS.map((d) => (
              <span key={d} className="text-[10px] font-medium text-gray-400 uppercase">{d.slice(0, 3)}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center gap-1">
            {days.map((day, idx) => {
              if (day === null) return <div key={`e-${idx}`} />;
              const isToday = isCurrentMonth && day === today;
              const hasAssessment = assessmentDates.has(day);
              const isFuture = new Date(viewYear, viewMonth, day) > now;

              return (
                <button
                  key={day}
                  className="flex flex-col items-center py-1.5 rounded-xl transition-all duration-200 cursor-pointer group"
                  style={{
                    background: isToday
                      ? "linear-gradient(135deg, rgb(251, 191, 36), rgb(245, 158, 11))"
                      : "transparent",
                  }}
                >
                  <span
                    className={`text-[15px] font-semibold leading-tight ${
                      isToday
                        ? "text-white"
                        : "text-gray-700 group-hover:text-amber-600"
                    }`}
                  >
                    {day}
                  </span>
                  {hasAssessment && (
                    <span
                      className={`w-1 h-1 rounded-full mt-0.5 ${
                        isToday ? "bg-white/70" : "bg-amber-400"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Assessment list */}
        <div>
          <div className="flex flex-col max-h-48 overflow-auto gap-2.5">
            {assessments.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No upcoming assessments.</p>
            )}
            {assessments.slice(0, 4).map((a, i) => (
              <div
                key={i}
                className="items-start gap-3 rounded-xl p-2.5 transition-all duration-200 hover:shadow-sm cursor-pointer"
                style={{
                  borderLeft: "3px solid rgb(245, 158, 11)",
                  backgroundColor: "rgb(255, 251, 235)",
                }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="text-[10px] font-semibold px-2 py-[2px] rounded-full w-fit"
                      style={{ backgroundColor: "rgb(254, 243, 199)", color: "rgb(146, 64, 14)" }}
                    >
                      {a.courseName || a.type || "Assessment"}
                    </div>
                    <div
                      className="text-[9px] font-bold px-1.5 py-[1px] rounded uppercase tracking-wider bg-white border"
                      style={{ borderColor: "rgb(245, 158, 11)", color: "rgb(146, 64, 14)" }}
                    >
                      Assessment
                    </div>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <div>
                      <p className="text-[10px]">Start Date:</p>
                      <div className="text-[11px] font-medium text-gray-500">
                        {a.startDate ? new Date(a.startDate).toLocaleString() : "—"}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px]">End Date:</p>
                      <div className="text-[11px] font-medium text-gray-500">
                        {a.endDate ? new Date(a.endDate).toLocaleString() : "—"}
                      </div>
                    </div>
                  </div>
                  <span className="text-[12.5px] font-semibold text-gray-700 leading-snug">
                    {a.title || a.name || "Assessment"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}