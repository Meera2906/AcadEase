import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, Clock, CircleDashed, FileBadge, ShieldCheck } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";

const STATUS_BADGE = { submitted: "pending", under_review: "in review", verified: "approved", rejected: "rejected" };

const STATUS_COPY = {
  submitted: "Your university has submitted your documents to TNTEU. They are waiting in the review queue.",
  under_review: "A TNTEU reviewer is working through your documents. Each one is checked individually.",
  verified: "Every required document has been verified by TNTEU. Your admission record is complete.",
  rejected: "One or more of your documents was rejected. Your university will need to resubmit them.",
};

const CHECKLIST_ICON = {
  verified: { icon: CheckCircle2, className: "text-success" },
  rejected: { icon: XCircle, className: "text-danger" },
  pending: { icon: Clock, className: "text-warning" },
  missing: { icon: CircleDashed, className: "text-text-muted" },
};

export default function AdmissionStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/admissions/my-application")
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="h-48 bg-white border border-border rounded-card animate-pulse" />
      </AppShell>
    );
  }

  if (!data?.applicant) {
    return (
      <AppShell>
        <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Admission Status</h1>
        <Card className="text-center py-12 mt-6">
          <p className="text-sm text-text-secondary">No admission application is linked to your account.</p>
          <p className="text-xs text-text-muted mt-1">
            If you applied through your college, ask them to check the applicant ID on your submission.
          </p>
        </Card>
      </AppShell>
    );
  }

  const { applicant, checklist, verifiedCount, requiredCount } = data;
  const complete = applicant.status === "verified";

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Admission Status</h1>
      <p className="text-sm text-text-secondary mb-6">
        {applicant.program} · {applicant.collegeName} · applicant ID <span className="font-mono">{applicant.applicantId}</span>
      </p>

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <Badge status={STATUS_BADGE[applicant.status] || applicant.status}>{applicant.status.replace("_", " ")}</Badge>
            <p className="text-sm text-text-secondary mt-2 max-w-xl">{STATUS_COPY[applicant.status]}</p>
          </div>
          <div className="text-right">
            <p className={`font-display text-3xl font-bold ${complete ? "text-success" : "text-text-primary"}`}>
              {verifiedCount}
              <span className="text-lg text-text-muted">/{requiredCount}</span>
            </p>
            <p className="text-xs text-text-muted">documents verified</p>
          </div>
        </div>

        <div className="h-2 rounded-pill bg-border overflow-hidden">
          <div
            className={`h-full rounded-pill ${complete ? "bg-success" : "bg-signal"}`}
            style={{ width: `${requiredCount ? (verifiedCount / requiredCount) * 100 : 0}%` }}
          />
        </div>

        {applicant.rejectionReason && (
          <div className="mt-4 p-3 rounded-card border border-[#ffc0c7] bg-[#FFE7E9]">
            <p className="text-xs font-semibold text-danger mb-1">What needs fixing</p>
            <p className="text-xs text-danger/90">{applicant.rejectionReason}</p>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h2 className="font-display text-lg font-bold text-text-primary mb-4">Your documents</h2>
          <div className="divide-y divide-border">
            {checklist.map((item) => {
              const style = CHECKLIST_ICON[item.status] || CHECKLIST_ICON.missing;
              const Icon = style.icon;
              const doc = data.documents.find((entry) => entry.documentType === item.documentType);
              return (
                <div key={item.documentType} className="flex items-start gap-3 py-3">
                  <Icon size={17} className={`${style.className} mt-0.5 shrink-0`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">{item.label}</p>
                    <p className="text-xs text-text-muted">
                      {item.status === "missing"
                        ? "Not submitted by your college yet"
                        : item.status === "verified"
                          ? `Verified${doc?.verifiedAt ? ` on ${new Date(doc.verifiedAt).toLocaleDateString()}` : ""}`
                          : item.status === "rejected"
                            ? doc?.rejectionReason || "Rejected"
                            : "Waiting for TNTEU review"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className={complete ? "border-success/40" : ""}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={17} className={complete ? "text-success" : "text-text-muted"} />
            <h2 className="font-display text-lg font-bold text-text-primary">Certificates</h2>
          </div>

          {complete ? (
            <>
              <p className="text-sm text-text-secondary mb-4">
                Your record is verified. Digitally signed certificates are available to download from your own device
                at any time — each carries a QR code anyone can use to check it is genuine.
              </p>
              <Link
                to="/student/certificates"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-pill bg-signal text-white text-sm font-semibold hover:bg-signal-dark shadow-card"
              >
                <FileBadge size={15} /> Go to my certificates
              </Link>
            </>
          ) : (
            <p className="text-sm text-text-secondary">
              Signed certificates unlock once TNTEU has verified all {requiredCount} required documents.
            </p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
