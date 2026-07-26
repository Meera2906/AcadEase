import { useNavigate } from "react-router-dom";

export default function ExploreCourses() {
  const navigate = useNavigate();

  return (
    <div className="h-full bg-ink-fade shadow-card rounded-card p-4 flex flex-col justify-between border border-white/5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          {/* Certificate icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24">
            <g fill="none">
              <path fill="url(#ec-g1)" d="M5 19h15.281S20 19.5 20 20s.281 1 .281 1H6a1 1 0 0 1-1-1z" />
              <path fill="url(#ec-g2)" d="M4 4.5A2.5 2.5 0 0 1 6.5 2H18a2.5 2.5 0 0 1 2.5 2.5v14.25a.75.75 0 0 1-.75.75H5.5a1 1 0 0 0 1 1h13.25a.75.75 0 0 1 0 1.5H6.5A2.5 2.5 0 0 1 4 19.5z" />
              <path fill="url(#ec-g3)" d="m10.542 8.608 1.1-2.23a.678.678 0 0 1 1.216 0l1.1 2.23 2.461.357c.556.08.778.764.376 1.157l-1.78 1.735.42 2.45a.678.678 0 0 1-.984.716l-2.201-1.157-2.2 1.157a.678.678 0 0 1-.985-.715l.42-2.45-1.78-1.736a.678.678 0 0 1 .376-1.157z" />
              <defs>
                <linearGradient id="ec-g1" x1="12.174" x2="12.174" y1="20.4" y2="18"><stop stopColor="#9DEAFF" /><stop offset=".716" stopColor="#58AAFE" /></linearGradient>
                <linearGradient id="ec-g2" x1="9.693" x2="12.681" y1="5.742" y2="27.308"><stop stopColor="#20AC9D" /><stop offset="1" stopColor="#2052CB" /></linearGradient>
                <linearGradient id="ec-g3" x1="10.893" x2="13.647" y1="7.655" y2="17.289"><stop stopColor="#FFE06B" /><stop offset="1" stopColor="#FF835C" /></linearGradient>
              </defs>
            </g>
          </svg>
          <div className="font-semibold text-[13px] text-slate-100">Campus Resources</div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Request bonafide, attendance & merit certificates instantly. Verified with QR.
        </p>
        <button
          onClick={() => navigate("/student/certificates")}
          className="mt-3 rounded-pill bg-citrus text-ink px-3 py-1.5 text-[11px] font-bold hover:opacity-90 transition-opacity"
        >
          Request Certificate
        </button>
      </div>
      <div className="flex justify-end mt-2">
        <svg viewBox="0 0 80 60" className="w-16 h-12 opacity-30" fill="none">
          <rect x="10" y="5" width="60" height="45" rx="4" stroke="#C6FF4D" strokeWidth="1.5" fill="#14162B" fillOpacity="0.5" />
          <path d="M25 22h30M25 30h20M25 38h15" stroke="#C6FF4D" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="58" cy="38" r="7" stroke="#C6FF4D" strokeWidth="1.5" />
          <path d="M55 38l2 2 4-4" stroke="#C6FF4D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
