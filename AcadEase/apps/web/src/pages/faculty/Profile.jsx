import { useEffect, useState } from "react";
import { Mail, Phone, BookOpen, Building2 } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";

function getInitials(name = "") {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-xl bg-signal/10 flex items-center justify-center shrink-0">
        <Icon size={15} className="text-signal" />
      </div>
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm font-medium text-text-primary">{value}</p>
      </div>
    </div>
  );
}

export default function FacultyProfile() {
  const [user, setUser] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/users/me"),
      api.get("/faculty/courses").catch(() => ({ data: { courses: [] } })),
    ]).then(([meRes, coursesRes]) => {
      setUser(meRes.data.user);
      setCourses(coursesRes.data.courses || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      </AppShell>
    );
  }

  if (!user) return <AppShell><p className="text-danger text-sm">Could not load profile.</p></AppShell>;

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-card bg-ink-fade p-6 md:p-8 mb-6">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-signal/20 blur-3xl" />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-teal/80 border-2 border-white/20 text-white flex items-center justify-center font-display text-xl font-bold shrink-0">
            {getInitials(user.name)}
          </div>
          <div>
            <p className="text-white/50 text-xs font-mono tracking-wider mb-1">FACULTY PROFILE</p>
            <p className="font-display text-xl font-bold text-white">{user.name}</p>
            <p className="text-white/50 text-sm mt-0.5">{user.designation || "Faculty"}</p>
            <p className="text-white/40 text-xs font-mono mt-0.5">{user.userId}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact info */}
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-text-primary mb-2">Contact & Details</h2>
          <InfoRow icon={Mail} label="Email" value={user.email} />
          <InfoRow icon={Phone} label="Phone" value={user.phone} />
          <InfoRow icon={Building2} label="Department" value={user.departmentId} />
          <InfoRow icon={BookOpen} label="Institution" value={user.institutionId} />
        </Card>

        {/* Courses */}
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-text-primary mb-3">
            Courses Teaching <span className="text-text-muted font-normal text-sm">({courses.length})</span>
          </h2>
          {courses.length === 0 ? (
            <p className="text-sm text-text-muted">No courses assigned.</p>
          ) : (
            <div className="space-y-2">
              {courses.map((c) => (
                <div key={c.courseId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{c.name}</p>
                    <p className="text-xs text-text-muted font-mono">{c.courseId} · Sem {c.semester} · Sec {c.section}</p>
                  </div>
                  <span className="text-xs text-text-muted">{c.enrolledCount} students</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
