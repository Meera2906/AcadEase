import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, CalendarCheck, ClipboardList,
  FileBadge, MessageSquareWarning, Bell, LogOut,
  GraduationCap, Menu, X, User, Users, Building2,
  BookOpen, Megaphone, BarChart2, ChevronDown,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../api/client.js";

const NAV_BY_ROLE = {
  student: [
    { to: "/student/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
    { to: "/student/attendance",   label: "Attendance",   icon: CalendarCheck },
    { to: "/student/results",      label: "Results",      icon: ClipboardList },
    { to: "/student/study-materials", label: "Study Materials", icon: BookOpen },
    { to: "/student/certificates", label: "Certificates", icon: FileBadge },
    { to: "/student/grievances",   label: "Grievances",   icon: MessageSquareWarning },
    { to: "/student/od-requests",  label: "OD Requests",  icon: ClipboardList },
  ],
  faculty: [
    { to: "/faculty/dashboard",    label: "Dashboard",       icon: LayoutDashboard },
    { to: "/faculty/attendance",   label: "Mark Attendance", icon: CalendarCheck },
    { to: "/faculty/results",      label: "Results",         icon: ClipboardList },
    { to: "/admin/study-materials", label: "Study Materials", icon: BookOpen },
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
    { to: "/admin/study-materials", label: "Study Materials", icon: BookOpen },
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
    { to: "/admin/study-materials", label: "Study Materials", icon: BookOpen },
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
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(false);
  const studyMaterialsRoute = user?.role === "student" ? "/student/study-materials" : "/admin/study-materials";
  const profileRoute = user?.role === "student" ? "/student/profile" : user?.role === "faculty" ? "/faculty/profile" : "/admin/profile";
  const compactNav = user?.role === "admin" || user?.role === "superadmin";
  const primaryItems = items.slice(0, compactNav ? 5 : items.length);
  const secondaryItems = compactNav ? items.slice(5) : [];
  const bellRef = useRef(null);
  const mobileRef = useRef(null);
  const materialsRef = useRef(null);
  const moreRef = useRef(null);

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
      if (materialsRef.current && !materialsRef.current.contains(e.target)) setMaterialsOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
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

  async function handleNotificationClick(n) {
    setBellOpen(false);
    if (!n.read) {
      try {
        await api.patch(`/notifications/${n._id}/read`);
        setNotifications((prev) => prev.map((x) => x._id === n._id ? { ...x, read: true } : x));
      } catch {}
    }
    if (n.linkTo) navigate(n.linkTo);
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
          <nav
            className={`hidden md:flex items-center gap-1 flex-1 overflow-hidden transition-all duration-200 ${compactNav ? "flex-wrap" : ""}`}
            style={{ maxWidth: compactNav ? (navExpanded ? 720 : 320) : "none" }}
            onMouseEnter={() => compactNav && setNavExpanded(true)}
            onMouseLeave={() => compactNav && setNavExpanded(false)}
          >
            {primaryItems.map(({ to, label, icon: Icon }) => {
              if (label === "Study Materials") {
                return (
                  <div key={label} className="relative" ref={materialsRef}>
                    <button
                      onMouseEnter={() => setMaterialsOpen(true)}
                      onMouseLeave={() => setMaterialsOpen(false)}
                      onFocus={() => setMaterialsOpen(true)}
                      onClick={(e) => {
                        e.preventDefault();
                        setMaterialsOpen((prev) => !prev);
                        navigate(studyMaterialsRoute);
                      }}
                      className="relative flex items-center gap-2 px-3 py-2 rounded-card text-sm font-medium transition-colors text-white/80"
                    >
                      <Icon size={15} />
                      {label}
                    </button>

                    {materialsOpen && (
                      <div className="absolute left-0 top-11 w-56 rounded-card border border-border bg-card shadow-lift overflow-hidden z-50">
                        <NavLink
                          to={`${studyMaterialsRoute}?tab=academic`}
                          onClick={() => setMaterialsOpen(false)}
                          className="flex items-center px-3 py-2.5 text-sm text-text-secondary hover:bg-paper hover:text-text-primary"
                        >
                          Academic Modules
                        </NavLink>
                        <NavLink
                          to={`${studyMaterialsRoute}?tab=tet`}
                          onClick={() => setMaterialsOpen(false)}
                          className="flex items-center px-3 py-2.5 text-sm text-text-secondary hover:bg-paper hover:text-text-primary"
                        >
                          TET Preparation
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2 px-3 py-2 rounded-card text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-ink-light text-white"
                        : "text-white/80"
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
              );
            })}
            {compactNav && secondaryItems.length > 0 && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setMoreOpen((prev) => !prev);
                  }}
                  className="flex items-center gap-2 rounded-card px-3 py-2 text-sm font-medium text-white/80 transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <BookOpen size={15} /> More
                  </span>
                  <ChevronDown size={14} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                </button>

                {moreOpen && (
                  <div className="absolute left-0 top-11 w-56 rounded-card border border-border bg-card shadow-lift overflow-hidden z-50">
                    {secondaryItems.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setMoreOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                            isActive ? "bg-paper text-text-primary" : "text-text-secondary"
                          }`
                        }
                      >
                        <Icon size={15} />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                      <button
                        key={n._id}
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left px-4 py-3 transition-colors hover:bg-signal/5 ${
                          n.read ? "bg-card" : "bg-[#EEF1FF]"
                        } ${n.linkTo ? "cursor-pointer" : "cursor-default"}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-signal shrink-0" />}
                          <div className={n.read ? "" : ""}>
                            <p className={`text-sm ${n.read ? "text-text-secondary" : "text-text-primary font-medium"}`}>
                              {n.title}
                            </p>
                            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{n.message}</p>
                            {n.linkTo && !n.read && (
                              <p className="text-xs text-signal mt-1">Tap to view →</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile avatar — desktop */}
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-white/10">
              <button
                onClick={() => navigate(profileRoute)}
                className="flex items-center gap-2 cursor-pointer hover:opacity-80"
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
