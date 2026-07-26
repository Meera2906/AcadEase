import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, CalendarCheck, ClipboardList,
  FileBadge, MessageSquareWarning, Bell, LogOut,
  GraduationCap, Menu, X, User, Users, Building2,
  BookOpen, Megaphone, BarChart2,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../api/client.js";

const NAV_BY_ROLE = {
  student: [
    { to: "/student/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
    { to: "/student/attendance",   label: "Attendance",   icon: CalendarCheck },
    { to: "/student/results",      label: "Results",      icon: ClipboardList },
    { to: "/student/certificates", label: "Certificates", icon: FileBadge },
    { to: "/student/grievances",   label: "Grievances",   icon: MessageSquareWarning },
  ],
  faculty: [
    { to: "/faculty/attendance",   label: "Mark Attendance", icon: CalendarCheck },
    { to: "/faculty/results",      label: "Results",         icon: ClipboardList },
    { to: "/faculty/od-requests",  label: "OD Requests",     icon: MessageSquareWarning },
    { to: "/admin/announcements",  label: "Announcements",   icon: Megaphone },
  ],
  admin: [
    { to: "/admin/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
    { to: "/admin/users",        label: "Users",        icon: Users },
    { to: "/admin/departments",  label: "Departments",  icon: Building2 },
    { to: "/admin/courses",      label: "Courses",      icon: BookOpen },
    { to: "/admin/attendance",   label: "Attendance",   icon: CalendarCheck },
    { to: "/admin/marks",        label: "Marks",        icon: ClipboardList },
    { to: "/admin/certificates", label: "Certificates", icon: FileBadge },
    { to: "/admin/grievances",   label: "Grievances",   icon: MessageSquareWarning },
    { to: "/admin/announcements",label: "Announcements",icon: Megaphone },
    { to: "/admin/reports",      label: "Reports",      icon: BarChart2 },
  ],
  superadmin: [
    { to: "/admin/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
    { to: "/admin/users",        label: "Users",        icon: Users },
    { to: "/admin/departments",  label: "Departments",  icon: Building2 },
    { to: "/admin/courses",      label: "Courses",      icon: BookOpen },
    { to: "/admin/attendance",   label: "Attendance",   icon: CalendarCheck },
    { to: "/admin/marks",        label: "Marks",        icon: ClipboardList },
    { to: "/admin/certificates", label: "Certificates", icon: FileBadge },
    { to: "/admin/grievances",   label: "Grievances",   icon: MessageSquareWarning },
    { to: "/admin/announcements",label: "Announcements",icon: Megaphone },
    { to: "/admin/reports",      label: "Reports",      icon: BarChart2 },
  ],
};

function getInitials(name = "") {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = (user && NAV_BY_ROLE[user.role]) || [];

  const [notifications, setNotifications] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const bellRef = useRef(null);
  const mobileRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const load = () =>
      api.get("/notifications").then((r) => setNotifications(r.data.notifications)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [user]);

  useEffect(() => {
    function outside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (mobileRef.current && !mobileRef.current.contains(e.target)) setMobileOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  async function markAllRead(e) {
    e.stopPropagation();
    try {
      await api.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  }

  const unread = notifications.filter((n) => !n.read).length;
  const ini = getInitials(user?.name);

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* ── Top Navbar ── */}
      <header className="bg-ink sticky top-0 z-40 border-b border-white/10">
        <div className="max-w-screen-xl mx-auto px-4 md:px-6 h-16 flex items-center gap-4">

          {/* Brand */}
          <NavLink to="/" className="flex items-center gap-2 shrink-0">
            <GraduationCap size={22} className="text-citrus" />
            <span className="font-display text-lg font-bold text-white tracking-tight">
              Acad<span className="text-citrus">Ease</span>
            </span>
          </NavLink>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 px-3 py-2 rounded-card text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-ink-light text-white"
                      : "text-white/55 hover:bg-ink-light hover:text-white/90"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-pill bg-citrus" />
                    )}
                    <Icon size={15} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 ml-auto">

            {/* Bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setBellOpen((o) => !o); }}
                className="relative w-9 h-9 flex items-center justify-center rounded-card text-white/60 hover:bg-ink-light hover:text-white transition-colors"
              >
                <Bell size={18} />
                {unread > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-coral text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div
                  className="absolute right-0 top-11 w-80 bg-card border border-border rounded-card shadow-lift z-50 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-paper">
                    <p className="font-display text-sm font-semibold text-text-primary">Notifications</p>
                    {unread > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-signal hover:underline font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {notifications.length === 0 && (
                      <p className="text-xs text-text-muted px-4 py-4 text-center">No notifications yet.</p>
                    )}
                    {notifications.map((n) => (
                      <div key={n._id} className={`px-4 py-3 ${n.read ? "bg-card" : "bg-[#EEF1FF]"}`}>
                        <p className={`text-sm ${n.read ? "text-text-secondary" : "text-text-primary font-medium"}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{n.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile avatar — desktop */}
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-white/10">
              <button
                onClick={() => user?.role === "student" ? navigate("/student/profile") : undefined}
                className={`flex items-center gap-2 ${user?.role === "student" ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
              >
                <div className="w-8 h-8 rounded-full bg-signal text-white flex items-center justify-center text-xs font-bold font-display">
                  {ini}
                </div>
                <div className="leading-none hidden lg:block text-left">
                  <p className="text-xs font-semibold text-white">{user?.name?.split(" ")[0]}</p>
                  <p className="text-[10px] text-white/40 capitalize">{user?.role}</p>
                </div>
              </button>
              <button
                onClick={logout}
                title="Log out"
                className="ml-1 w-8 h-8 flex items-center justify-center rounded-card text-white/40 hover:bg-ink-light hover:text-white transition-colors"
              >
                <LogOut size={15} />
              </button>
            </div>

            {/* Hamburger — mobile */}
            <div className="md:hidden relative" ref={mobileRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setMobileOpen((o) => !o); }}
                className="w-9 h-9 flex items-center justify-center rounded-card text-white/60 hover:bg-ink-light transition-colors"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>

              {/* Mobile dropdown */}
              {mobileOpen && (
                <div
                  className="absolute right-0 top-11 w-64 bg-ink border border-white/10 rounded-card shadow-lift overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                    <div className="w-9 h-9 rounded-full bg-signal text-white flex items-center justify-center text-sm font-bold font-display shrink-0">
                      {ini}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{user?.name}</p>
                      <p className="text-xs text-white/40 capitalize">{user?.role}</p>
                    </div>
                  </div>
                  <nav className="px-2 py-2 space-y-0.5">
                    {items.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-card text-sm font-medium transition-colors ${
                            isActive ? "bg-ink-light text-white" : "text-white/55 hover:bg-ink-light hover:text-white/90"
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="w-1 h-4 rounded-pill bg-citrus shrink-0" />}
                            <Icon size={17} />
                            {label}
                          </>
                        )}
                      </NavLink>
                    ))}
                    {user?.role === "student" && (
                      <button
                        onClick={() => { navigate("/student/profile"); setMobileOpen(false); }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-card text-sm font-medium text-white/55 hover:bg-ink-light hover:text-white/90 w-full transition-colors"
                      >
                        <User size={17} /> My Profile
                      </button>
                    )}
                  </nav>
                  <div className="px-2 py-2 border-t border-white/10">
                    <button
                      onClick={logout}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-card text-sm text-white/55 hover:bg-ink-light hover:text-white/90 w-full transition-colors"
                    >
                      <LogOut size={17} /> Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 w-full max-w-screen-xl mx-auto px-4 md:px-6 py-6 pb-20 md:pb-6">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border flex justify-around py-2 z-30">
        {items.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-2 text-xs ${isActive ? "text-signal" : "text-text-muted"}`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
