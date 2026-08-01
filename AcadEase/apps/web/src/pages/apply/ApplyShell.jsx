import { NavLink, useNavigate } from "react-router-dom";
import { GraduationCap, LogOut, ShieldCheck } from "lucide-react";
import { useApplicant } from "../../context/ApplicantContext.jsx";

const STEPS = [
  { to: "/apply/documents", label: "Documents" },
  { to: "/apply/status", label: "Status" },
];

export default function ApplyShell({ children }) {
  const { applicant, logout } = useApplicant();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="bg-ink border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <GraduationCap size={22} className="text-citrus" />
            <div className="leading-none">
              <span className="font-display text-lg font-bold text-white tracking-tight">
                Acad<span className="text-citrus">Ease</span>
              </span>
              <p className="text-[10px] text-white/40 mt-0.5">TNTEU Admission Portal</p>
            </div>
          </div>

          {applicant && (
            <nav className="hidden sm:flex items-center gap-1 ml-4">
              {STEPS.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-card text-sm font-medium ${isActive ? "bg-ink-light text-white" : "text-white/70"}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-3">
            {applicant ? (
              <>
                <div className="text-right hidden sm:block leading-none">
                  <p className="text-xs font-semibold text-white">{applicant.name}</p>
                  <p className="text-[10px] text-white/40 font-mono">{applicant.applicantId}</p>
                </div>
                <button
                  onClick={async () => { await logout(); navigate("/apply/login"); }}
                  title="Sign out"
                  className="w-8 h-8 flex items-center justify-center rounded-card text-white/50 hover:bg-ink-light hover:text-white"
                >
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <NavLink to="/login" className="text-xs text-white/60 hover:text-white">
                Staff / student login
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-6 py-8">{children}</main>

      <footer className="border-t border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 flex items-start gap-2">
          <ShieldCheck size={14} className="text-success mt-0.5 shrink-0" />
          <p className="text-[11px] text-text-muted leading-relaxed">
            Every certificate you upload is encrypted the moment it reaches our servers. Only TNTEU and the
            university you applied to hold a key to open it — no other college, no faculty member, and no other
            applicant can read your documents.
          </p>
        </div>
      </footer>
    </div>
  );
}
