import { useEffect, useState } from "react";
import { Mail, Phone, Building2, BookOpen, Users } from "lucide-react";
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

export default function AdminProfile() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/users/me"),
      api.get("/admin/dashboard").catch(() => ({ data: null })),
    ]).then(([meRes, dashRes]) => {
      setUser(meRes.data.user);
      setStats(dashRes.data);
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
          <div className="w-16 h-16 rounded-full bg-coral/80 border-2 border-white/20 text-white flex items-center justify-center font-display text-xl font-bold shrink-0">
            {getInitials(user.name)}
          </div>
          <div>
            <p className="text-white/50 text-xs font-mono tracking-wider mb-1">{user.role.toUpperCase()} PROFILE</p>
            <p className="font-display text-xl font-bold text-white">{user.name}</p>
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

        {/* Institution stats */}
        {stats && (
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold text-text-primary mb-3">Institution Overview</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total Students", value: stats.totalStudents, icon: Users },
                { label: "Total Faculty", value: stats.totalFaculty, icon: Users },
                { label: "Pending Certificates", value: stats.pendingCertificates, icon: BookOpen },
                { label: "Open Grievances", value: stats.pendingGrievances, icon: Building2 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="bg-paper rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-signal/10 flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-signal" />
                  </div>
                  <div>
                    <p className="font-display text-lg font-bold text-text-primary">{value ?? "—"}</p>
                    <p className="text-[10px] text-text-muted leading-tight">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
