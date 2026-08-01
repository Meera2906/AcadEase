import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Clock, CircleDashed, AlertTriangle, UserPlus } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const STATUS_BADGE = { submitted: "pending", under_review: "in review", verified: "approved", rejected: "rejected" };

const CHECKLIST_ICON = {
  verified: { icon: CheckCircle2, className: "text-success" },
  rejected: { icon: XCircle, className: "text-danger" },
  pending: { icon: Clock, className: "text-warning" },
  missing: { icon: CircleDashed, className: "text-text-muted" },
};

export default function AdmissionsApplicantDetail() {
  const { applicantId } = useParams();
  const { user } = useAuth();
  const isTnteu = user?.role === "tnteu_admin";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admissions/applicants/${applicantId}`);
      setData(res.data);
    } catch (err) {
      showToast(err.response?.data?.error || "Applicant not found.", "error");
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => { load(); }, [load]);

  async function enroll() {
    setEnrolling(true);
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
      setEnrolling(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="h-40 bg-white border border-border rounded-card animate-pulse" />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <Card className="text-center py-12"><p className="text-sm text-text-secondary">Applicant not found.</p></Card>
      </AppShell>
    );
  }

  const { applicant, documents, checklist, verifiedCount, requiredCount } = data;
  const extras = documents.filter((doc) => !checklist.some((item) => item.documentType === doc.documentType));

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <Link to="/admin/admissions/applicants" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-signal mb-4">
        <ArrowLeft size={15} /> Back to applicants
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">{applicant.name}</h1>
          <p className="text-sm text-text-secondary font-mono">
            {applicant.applicantId} · {applicant.program}
            {applicant.rollNumber ? ` · ${applicant.rollNumber}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge status={STATUS_BADGE[applicant.status] || applicant.status}>{applicant.status.replace("_", " ")}</Badge>
          {applicant.studentUserId ? (
            <span className="text-xs text-success font-semibold">Enrolled as {applicant.studentUserId}</span>
          ) : applicant.status === "verified" ? (
            <Button size="sm" variant="success" disabled={enrolling} onClick={enroll}>
              <UserPlus size={14} className="mr-1" /> {enrolling ? "Enrolling…" : "Enrol as student"}
            </Button>
          ) : null}
        </div>
      </div>

      {applicant.rejectionReason && (
        <div className="mb-6 p-4 rounded-card border border-[#ffc0c7] bg-[#FFE7E9]">
          <p className="text-sm font-semibold text-danger mb-1">Rejected by TNTEU</p>
          <p className="text-sm text-danger/90">{applicant.rejectionReason}</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Checklist */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-text-primary">Required document checklist</h2>
            <span className={`text-sm font-semibold ${verifiedCount === requiredCount ? "text-success" : "text-text-secondary"}`}>
              {verifiedCount} of {requiredCount} verified
            </span>
          </div>

          <div className="h-2 rounded-pill bg-border overflow-hidden mb-5">
            <div
              className={`h-full rounded-pill ${verifiedCount === requiredCount ? "bg-success" : "bg-signal"}`}
              style={{ width: `${requiredCount ? (verifiedCount / requiredCount) * 100 : 0}%` }}
            />
          </div>

          <div className="divide-y divide-border">
            {checklist.map((item) => {
              const style = CHECKLIST_ICON[item.status] || CHECKLIST_ICON.missing;
              const Icon = style.icon;
              const doc = documents.find((entry) => entry.documentType === item.documentType);
              return (
                <div key={item.documentType} className="flex items-start gap-3 py-3">
                  <Icon size={17} className={`${style.className} mt-0.5 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{item.label}</p>
                    <p className="text-xs text-text-muted">
                      {item.status === "missing" ? "Not uploaded yet" : `Status: ${item.status}`}
                      {doc?.rejectionReason ? ` — ${doc.rejectionReason}` : ""}
                    </p>
                    {item.flags?.length > 0 && (
                      <p className="text-xs text-warning font-medium mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} /> {item.flags.join(", ")}
                      </p>
                    )}
                  </div>
                  {doc && isTnteu && doc.status === "pending" && (
                    <Link to={`/admin/verification/${doc._id}`} className="text-xs text-signal font-semibold hover:underline shrink-0">
                      Review →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {extras.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-xs font-semibold text-text-secondary mb-2">Additional documents submitted</p>
              {extras.map((doc) => (
                <div key={doc._id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-text-secondary">{doc.label}</span>
                  <div className="flex items-center gap-2">
                    {doc.flags?.length > 0 && <span className="text-xs text-warning">{doc.flags.join(", ")}</span>}
                    <Badge status={doc.status === "verified" ? "approved" : doc.status}>{doc.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Applicant record */}
        <Card>
          <h2 className="font-display text-lg font-bold text-text-primary mb-4">Applicant record</h2>
          <dl className="space-y-3 text-sm">
            {[
              ["Program", applicant.program],
              ["Date of birth", applicant.dob],
              ["Email", applicant.email],
              ["Phone", applicant.phone],
              ["Category", applicant.category],
              ["University", applicant.collegeId],
              ["Submitted", applicant.submittedAt && new Date(applicant.submittedAt).toLocaleDateString()],
              ["Reviewed", applicant.reviewedAt && new Date(applicant.reviewedAt).toLocaleDateString()],
              ["Reviewed by", applicant.reviewedBy],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-text-muted">{label}</dt>
                  <dd className="text-text-primary font-medium text-right break-all">{value}</dd>
                </div>
              ))}
          </dl>
        </Card>
      </div>
    </AppShell>
  );
}
