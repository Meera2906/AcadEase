import { Navigate, useLocation, Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

// Where each role belongs when they land somewhere they should not be.
const HOME_BY_ROLE = {
  student: "/student/dashboard",
  faculty: "/faculty/dashboard",
  college_admin: "/admin/dashboard",
  college_coordinator: "/admin/dashboard",
  tnteu_admin: "/admin/verification",
};

export default function ProtectedRoute({ roles, children }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  // The session is still being restored from the refresh cookie. Deciding now
  // would mean redirecting a signed-in user to the login page every time they
  // reloaded or opened a page in a new tab.
  if (booting) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-border border-t-signal animate-spin" />
      </div>
    );
  }

  if (!user) {
    // Remember where they were headed so the login screen can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Signed in, but not for this page. Sending them to /login would look exactly
  // like being logged out, which is both alarming and misleading — they are
  // authenticated, just not authorised.
  if (roles && !roles.includes(user.role)) {
    const home = HOME_BY_ROLE[user.role] || "/login";
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-card shadow-card max-w-md w-full px-6 py-8 text-center">
          <ShieldAlert size={34} className="text-warning mx-auto mb-3" />
          <h1 className="font-display text-lg font-bold text-text-primary">This page isn't for your role</h1>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">
            You're signed in as <span className="font-semibold text-text-primary">{user.name}</span>{" "}
            (<span className="font-mono text-xs">{user.role}</span>), and{" "}
            <span className="font-mono text-xs">{location.pathname}</span> is restricted to{" "}
            {roles.map((r) => <span key={r} className="font-mono text-xs">{r}</span>).reduce((a, b) => [a, ", ", b])}.
          </p>
          <p className="text-xs text-text-muted mt-2">You have not been signed out.</p>
          <Link
            to={home}
            className="inline-block mt-5 px-4 py-2.5 bg-signal text-white rounded-xl text-sm font-semibold hover:bg-signal-dark"
          >
            Go to your dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
