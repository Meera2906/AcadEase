import { useEffect, useState } from "react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";

export default function StudentResults() {
  const { user } = useAuth();
  const [marks, setMarks]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.get(`/marks/student/${user.userId}`)
      .then((res) => setMarks(res.data.marks))
      .finally(() => setLoading(false));
  }, [user]);

  const byCourse = {};
  for (const m of marks) {
    const cid = m.courseId || m.assessmentId?.courseId || "Unknown";
    if (!byCourse[cid]) byCourse[cid] = [];
    byCourse[cid].push(m);
  }

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Results</h1>
      <p className="text-sm text-text-secondary mb-6">Your assessment marks across all subjects.</p>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map((i) => <div key={i} className="h-32 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : Object.keys(byCourse).length === 0 ? (
        <p className="text-text-muted text-sm py-12 text-center">No marks published yet.</p>
      ) : (
        <div className="space-y-5">
          {Object.entries(byCourse).map(([courseId, entries]) => {
            const totalObtained = entries.reduce((s, e) => s + (e.marksObtained ?? 0), 0);
            const totalMax      = entries.reduce((s, e) => s + (e.assessmentId?.maxMarks ?? 0), 0);
            const pct = totalMax ? Math.round((totalObtained / totalMax) * 100) : 0;

            return (
              <Card key={courseId}>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                  <h2 className="font-display font-semibold text-text-primary">{courseId}</h2>
                  {totalMax > 0 && (
                    <div className="text-right">
                      <span className={`font-display text-lg font-bold ${pct < 50 ? "text-danger" : pct < 70 ? "text-warning" : "text-success"}`}>
                        {pct}%
                      </span>
                      <p className="text-xs text-text-muted">{totalObtained} / {totalMax}</p>
                    </div>
                  )}
                </div>
                <div className="divide-y divide-border">
                  {entries.map((m) => {
                    const assessment = m.assessmentId;
                    const maxMarks   = assessment?.maxMarks ?? "—";
                    const obtained   = m.isAbsent ? null : m.marksObtained;
                    const scorePct   = maxMarks !== "—" && obtained != null ? Math.round((obtained / maxMarks) * 100) : null;
                    return (
                      <div key={m._id} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {assessment?.title || assessment?.type || "Assessment"}
                          </p>
                          <p className="text-xs text-text-muted">{assessment?.type}</p>
                        </div>
                        <div className="text-right shrink-0">
                          {m.isAbsent ? (
                            <Badge status="absent">AB</Badge>
                          ) : obtained == null ? (
                            <span className="text-xs text-text-muted">Not submitted</span>
                          ) : (
                            <span className={`font-display font-bold text-sm ${
                              scorePct != null && scorePct < 50 ? "text-danger" :
                              scorePct != null && scorePct < 70 ? "text-warning" : "text-success"
                            }`}>
                              {obtained}<span className="text-text-muted font-normal text-xs"> / {maxMarks}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
