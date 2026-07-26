import { useState } from "react";

export default function CoursePerformanceTable({ subjects = [] }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filtered = subjects.filter(
    (s) =>
      (s.courseName || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.courseId || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative bg-white shadow-sm rounded-2xl mt-4 p-3">
      <div className="flex justify-between items-center mb-2">
        <div className="text-zinc-700 text-sm font-semibold">Course-wise Performance :</div>
        <div className="relative">
          <svg
            stroke="currentColor"
            fill="none"
            strokeWidth="2"
            viewBox="0 0 24 24"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"
            height="1em"
            width="1em"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 w-48 transition-all focus:w-56"
            type="text"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="bg-slate-100/80 border-b border-slate-200 px-5 p-3 text-[12px] font-semibold text-zinc-700 grid grid-cols-7 gap-3">
          <div className="col-span-2">Course</div>
          <div className="col-span-2">Progress</div>
          <div className="col-span-1">Time Spend</div>
          <div className="col-span-1">Rank</div>
          <div className="col-span-1">Badge</div>
        </div>

        <div className="px-3 py-2 flex flex-col gap-2">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No courses found.</p>
          )}
          {filtered.map((s) => {
            const pct = s.percentage || 0;
            const rank = s.rank || Math.floor(Math.random() * 200) + 1;
            const badges = s.totalXp || Math.floor(pct * 10);
            const isOpen = expanded[s.courseId];
            return (
              <div
                key={s.courseId}
                className="border rounded-lg border-slate-200 shadow-sm"
              >
                <div
                  className="grid grid-cols-7 gap-3 p-2 rounded-lg group cursor-pointer transition-all hover:border-emerald-300 hover:bg-emerald-50"
                  onClick={() => toggleExpand(s.courseId)}
                >
                  <div className="col-span-2 flex items-center">
                    <div className="group-hover:text-emerald-600">
                      <svg
                        stroke="currentColor"
                        fill="currentColor"
                        strokeWidth="0"
                        viewBox="0 0 20 20"
                        className={`w-5 h-5 transform transition-transform duration-300 ${
                          isOpen ? "rotate-90" : "rotate-0"
                        }`}
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex shrink-0 gap-2 items-center justify-center w-10 h-10 rounded-lg bg-gray-100 border border-gray-200">
                        <div className="w-[26px] h-[26px] rounded bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-xs font-bold">
                          {(s.courseName || "C").charAt(0)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[12px] font-medium leading-tight">
                          {s.courseName}
                        </p>
                        <p className="text-[11px] text-emerald-600 font-semibold">{s.courseId}</p>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 flex items-center">
                    <div className="flex items-center gap-1 w-full mr-8">
                      <div className="relative h-[7px] w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full transition-all bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="font-semibold text-[12px] text-zinc-500 whitespace-nowrap">
                        {pct}%
                      </p>
                    </div>
                  </div>

                  <div className="col-span-1 flex items-center">
                    <div className="flex items-center gap-1">
                      <svg viewBox="0 0 25 25" className="w-[25px]" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12.5" cy="12.5" r="9" stroke="#94a3b8" />
                        <path d="M12.5 8v4.5L16 15" stroke="#94a3b8" strokeLinecap="round" />
                      </svg>
                      <div className="font-semibold text-[12px] text-zinc-500">
                        {s.timeSpent || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="col-span-1 flex items-center">
                    <div className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-500" opacity="0.7">
                        <path d="M11.146 3.023C11.526 2.34 11.716 2 12 2s.474.34.854 1.023l.098.176c.108.194.162.29.246.354c.085.064.19.088.4.135l.19.044c.738.167 1.107.25 1.195.532s-.164.577-.667 1.165l-.13.152c-.143.167-.215.25-.247.354s-.021.215 0 .438l.02.203c.076.785.114 1.178-.115 1.352c-.23.175-.576.015-1.267-.303l-.178-.082c-.197-.09-.295-.136-.399-.136s-.202.046-.399.136l-.178.082c-.691.318-1.037.478-1.267.303c-.23-.174-.191-.567-.115-1.352l.02-.203c.021-.223.032-.334 0-.438s-.104-.187-.247-.354l-.13-.152c-.503-.588-.755-.882-.667-1.165c.088-.282.457-.365 1.195-.532l.19-.044c.21-.047.315-.07.4-.135c.084-.064.138-.16.246-.354zM13 10h-2c-1.414 0-2.121 0-2.56.44C8 10.878 8 11.585 8 13v9h8v-9c0-1.414 0-2.121-.44-2.56C15.122 10 14.415 10 13 10" />
                        <path d="M7.56 19.44C7.122 19 6.415 19 5 19s-2.121 0-2.56.44C2 19.878 2 20.585 2 22h6c0-1.414 0-2.121-.44-2.56M16 19v3h6v-3c0-1.414 0-2.121-.44-2.56C21.122 16 20.415 16 19 16s-2.121 0-2.56.44C16 16.878 16 17.585 16 19" opacity=".5" />
                      </svg>
                      <div className="font-semibold text-[12px] text-zinc-500">#{rank}</div>
                    </div>
                  </div>

                  <div className="col-span-1 flex items-center">
                    <div className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" className="text-emerald-500">
                        <g fill="none">
                          <path fill="url(#bp-g1)" d="m16 11.65l4.662-2.448A2.5 2.5 0 0 0 22 6.99V3.75A1.75 1.75 0 0 0 20.25 2H16l-1 5z" />
                          <path fill="url(#bp-g2)" d="M8 2H3.75A1.75 1.75 0 0 0 2 3.75v3.239a2.5 2.5 0 0 0 1.338 2.213L8 11.65l1-4.661z" />
                          <path fill="url(#bp-g3)" d="M8 11.65V2h8v9.65l-3.187 1.673a1.75 1.75 0 0 1-1.626 0z" />
                          <path fill="url(#bp-g4)" d="M17 17a5 5 0 1 1-10 0a5 5 0 0 1 10 0" />
                          <defs>
                            <linearGradient id="bp-g1" x1="22" x2="14.966" y1="2.858" y2="10.309"><stop stopColor="#52D17C" /><stop offset="1" stopColor="#1A7F7C" /></linearGradient>
                            <linearGradient id="bp-g2" x1="2" x2="9.064" y1="4.599" y2="9.274"><stop stopColor="#52D17C" /><stop offset="1" stopColor="#1A7F7C" /></linearGradient>
                            <linearGradient id="bp-g3" x1="12" x2="15.64" y1=".559" y2="12.405"><stop stopColor="#76EB95" /><stop offset="1" stopColor="#1EC8B0" /></linearGradient>
                            <radialGradient id="bp-g4" cx="0" cy="0" r="1" gradientTransform="rotate(56.615 14.048 -25.06)scale(55.8175 47.8051)"><stop offset=".772" stopColor="#FFCD0F" /><stop offset=".991" stopColor="#E67505" /></radialGradient>
                          </defs>
                        </g>
                      </svg>
                      <div className="font-semibold text-[12px] text-zinc-500">{badges}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}