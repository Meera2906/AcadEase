import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Database, Search, ChevronLeft, ChevronRight, Lock, Users } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const selectClass =
  "px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-2 focus:ring-signal/30";

export default function UmisStudents() {
  const [params, setParams] = useSearchParams();
  const { toast, showToast, clearToast } = useToast();

  const [filters, setFilters] = useState({ colleges: [], departments: [], batchYears: [] });
  const [data, setData] = useState({ students: [], page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [collegeId, setCollegeId] = useState(params.get("collegeId") || "");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/umis/filters").then((r) => setFilters(r.data)).catch(() => {});
  }, []);

  // The typed query only hits the register once it settles.
  useEffect(() => {
    const id = setTimeout(() => { setPage(1); setSearch(q.trim()); }, 350);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/umis/students", {
        params: {
          page, limit: 25,
          q: search || undefined,
          collegeId: collegeId || undefined,
          departmentId: departmentId || undefined,
          status: status || undefined,
        },
      });
      setData(res.data);
    } catch (e) {
      showToast(e.response?.data?.error || "Could not reach the UMIS register.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, collegeId, departmentId, status]);

  useEffect(() => { load(); }, [load]);

  // Keep the college filter in the URL so the analysis page can deep-link into it.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (collegeId) next.set("collegeId", collegeId);
    else next.delete("collegeId");
    setParams(next, { replace: true });
  }, [collegeId]);

  const departmentsForCollege = collegeId
    ? filters.departments.filter((d) => d.collegeId === collegeId)
    : filters.departments;

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2 mb-1">
        <Database size={22} className="text-citrus" /> Student Data — UMIS
      </h1>
      <p className="text-sm text-text-secondary mb-5 max-w-3xl">
        The state register of every student at every affiliated college. Read-only: TNTEU can look a record up
        without going through the college office, but corrections stay the college's responsibility. Each file you
        open is written to the audit log.
      </p>

      <Card className="mb-4 !p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, UMIS ID, enrolment number or email"
              className={`${selectClass} w-full pl-9`}
            />
          </div>
          <select value={collegeId} onChange={(e) => { setPage(1); setCollegeId(e.target.value); setDepartmentId(""); }} className={selectClass}>
            <option value="">All colleges</option>
            {filters.colleges.map((c) => <option key={c.collegeId} value={c.collegeId}>{c.name}</option>)}
          </select>
          <select value={departmentId} onChange={(e) => { setPage(1); setDepartmentId(e.target.value); }} className={selectClass}>
            <option value="">All departments</option>
            {departmentsForCollege.map((d) => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
          </select>
          <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className={selectClass}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <span className="text-xs text-text-muted ml-auto flex items-center gap-1.5">
            <Lock size={12} /> {data.total} record(s)
          </span>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-white border border-border rounded-card animate-pulse" />)}</div>
      ) : data.students.length === 0 ? (
        <Card className="text-center py-12">
          <Users size={26} className="text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No UMIS records match those filters.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary">UMIS ID</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary">Student</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary">College</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary">Department</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary">Sem</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary">Programme</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.students.map((s) => (
                <tr key={s.userId} className="hover:bg-paper/60">
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{s.umisId}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-primary">{s.name}</p>
                    <p className="text-xs text-text-muted">{s.enrollmentNumber || s.userId}</p>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {s.collegeName}
                    {s.district && <span className="block text-xs text-text-muted">{s.district}</span>}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{s.departmentName}</td>
                  <td className="px-4 py-3 text-text-secondary">{s.semester ?? "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {s.programme || <span className="text-text-muted">Not via TNTEU pipeline</span>}
                  </td>
                  <td className="px-4 py-3"><Badge status={s.status === "active" ? "active" : "holiday"}>{s.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/umis/${s.userId}`} className="text-xs font-semibold text-signal hover:underline">
                      Open file
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-text-muted">Page {data.page} of {data.totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} /> Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
