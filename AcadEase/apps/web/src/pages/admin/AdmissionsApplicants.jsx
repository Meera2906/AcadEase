import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, AlertTriangle, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const STATUS_BADGE = {
  submitted: "pending",
  under_review: "in review",
  verified: "approved",
  rejected: "rejected",
};

function ChecklistBar({ verified, required }) {
  const pct = required ? Math.round((verified / required) * 100) : 0;
  const complete = verified === required;
  return (
    <div className="min-w-[120px]">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className={complete ? "text-success font-semibold" : "text-text-secondary"}>
          {verified} of {required} verified
        </span>
      </div>
      <div className="h-1.5 rounded-pill bg-border overflow-hidden">
        <div
          className={`h-full rounded-pill ${complete ? "bg-success" : "bg-signal"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function AdmissionsApplicants() {
  const [data, setData] = useState({ applicants: [], page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [enrolling, setEnrolling] = useState(null);
  const { toast, showToast, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admissions/applicants", { params: { page, limit: 20, status: status || undefined, q: search || undefined } });
      setData(res.data);
    } catch (err) {
      showToast(err.response?.data?.error || "Could not load applicants.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { load(); }, [load]);

  async function enroll(applicantId) {
    setEnrolling(applicantId);
    try {
      const res = await api.post(`/admissions/applicants/${applicantId}/enroll`);
      showToast(
        res.data.temporaryPassword
          ? `Enrolled. Login: ${res.data.studentUserId} · temporary password: ${res.data.temporaryPassword}`
          : `Enrolled as ${res.data.studentUserId}.`,
        "success"
      );
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || "Enrolment failed.", "error");
    } finally {
      setEnrolling(null);
    }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Applicants</h1>
      <p className="text-sm text-text-secondary mb-6">
        {data.total} applicant{data.total === 1 ? "" : "s"} submitted to TNTEU. An applicant only turns
        <span className="font-semibold"> verified</span> once every required document has been individually verified.
      </p>

      <Card className="mb-4 !p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <form
            onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query); }}
            className="flex items-center gap-2 flex-1 min-w-[220px]"
          >
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, applicant ID or roll number"
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-signal/30"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
          </form>

          <select
            value={status}
            onChange={(event) => { setPage(1); setStatus(event.target.value); }}
            className="px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-2 focus:ring-signal/30"
          >
            <option value="">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      ) : data.applicants.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-sm text-text-secondary">No applicants yet.</p>
          <Link to="/admin/admissions/upload" className="text-sm text-signal font-semibold hover:underline mt-2 inline-block">
            Submit an applicant batch →
          </Link>
        </Card>
      ) : (
        <div className="border border-border rounded-card overflow-hidden bg-card">
          <div className="hidden md:grid grid-cols-[1.6fr_0.7fr_1fr_1fr_auto] gap-4 px-4 py-2.5 bg-paper border-b border-border text-xs font-semibold text-text-secondary">
            <span>Applicant</span>
            <span>Program</span>
            <span>Checklist</span>
            <span>Status</span>
            <span />
          </div>
          <div className="divide-y divide-border">
            {data.applicants.map((applicant) => (
              <div key={applicant.applicantId} className="grid md:grid-cols-[1.6fr_0.7fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center">
                <div>
                  <Link
                    to={`/admin/admissions/applicants/${applicant.applicantId}`}
                    className="text-sm font-semibold text-text-primary hover:text-signal"
                  >
                    {applicant.name}
                  </Link>
                  <p className="text-xs text-text-muted font-mono">
                    {applicant.applicantId}
                    {applicant.rollNumber ? ` · ${applicant.rollNumber}` : ""}
                  </p>
                </div>

                <span className="text-sm text-text-secondary">{applicant.program}</span>

                <div className="flex items-center gap-2">
                  <ChecklistBar verified={applicant.verifiedCount} required={applicant.requiredCount} />
                  {applicant.flaggedCount > 0 && (
                    <span title={`${applicant.flaggedCount} flagged document(s)`} className="text-warning flex items-center gap-0.5 text-xs font-semibold">
                      <AlertTriangle size={13} /> {applicant.flaggedCount}
                    </span>
                  )}
                </div>

                <div>
                  <Badge status={STATUS_BADGE[applicant.status] || applicant.status}>
                    {applicant.status.replace("_", " ")}
                  </Badge>
                  {applicant.uploadedCount < applicant.requiredCount && (
                    <p className="text-[11px] text-text-muted mt-1">
                      {applicant.requiredCount - applicant.uploadedCount} document(s) not uploaded
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  {applicant.studentUserId ? (
                    <span className="text-xs text-success font-semibold">Enrolled</span>
                  ) : applicant.status === "verified" ? (
                    <Button size="sm" variant="success" disabled={enrolling === applicant.applicantId} onClick={() => enroll(applicant.applicantId)}>
                      <UserPlus size={13} className="mr-1" />
                      {enrolling === applicant.applicantId ? "Enrolling…" : "Enrol"}
                    </Button>
                  ) : (
                    <Link to={`/admin/admissions/applicants/${applicant.applicantId}`} className="text-xs text-signal font-semibold hover:underline">
                      View
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
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
