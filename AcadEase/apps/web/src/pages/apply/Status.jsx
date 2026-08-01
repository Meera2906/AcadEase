import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Clock, CircleDashed, Lock, ShieldCheck } from "lucide-react";
import { applicantApi, useApplicant } from "../../context/ApplicantContext.jsx";
import ApplyShell from "./ApplyShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";

const STATUS_BADGE = { submitted: "pending", under_review: "in review", verified: "approved", rejected: "rejected" };

const STATUS_COPY = {
  submitted: "Your documents are in TNTEU's verification queue.",
  under_review: "A TNTEU reviewer is working through your documents one by one.",
  verified: "Every required document has been verified. Your university will now create your student account.",
  rejected: "One or more documents were rejected. Read the reason below and contact your university to resubmit.",
};

const ICON = {
  verified: { icon: CheckCircle2, className: "text-success" },
  rejected: { icon: XCircle, className: "text-danger" },
  pending: { icon: Clock, className: "text-warning" },
  missing: { icon: CircleDashed, className: "text-text-muted" },
};

export default function ApplyStatus() {
  const navigate = useNavigate();
  const { applicant, booting } = useApplicant();
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await applicantApi.get("/applicant/me");
      setView(data);
    } catch {
      navigate("/apply/login");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (booting) return;
    if (!applicant) { navigate("/apply/login"); return; }
    load();
  }, [booting, applicant?.applicantId]);

  if (booting || loading) {
    return <ApplyShell><div className="h-64 bg-white border border-border rounded-card animate-pulse" /></ApplyShell>;
  }
  if (!view) return null;

  const { checklist, verifiedCount, requiredCount, documents } = view;
  const app = view.applicant;
  const isDraft = app.stage === "draft";

  return (
    <ApplyShell>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Application status</h1>
      <p className="text-sm text-text-secondary mb-6">
        {app.program} · {app.collegeName} · <span className="font-mono">{app.applicantId}</span>
      </p>

      {isDraft ? (
        <Card className="text-center py-10">
          <p className="text-sm font-semibold text-text-primary mb-1">Your application is still a draft</p>
          <p className="text-xs text-text-secondary mb-4">
            It has not been sent to TNTEU yet — nothing is in the review queue.
          </p>
          <Link to="/apply/documents" className="text-sm text-signal font-semibold hover:underline">
            Finish uploading your documents →
          </Link>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <Badge status={STATUS_BADGE[app.status] || app.status}>{app.status.replace("_", " ")}</Badge>
                <p className="text-sm text-text-secondary mt-2 max-w-xl">{STATUS_COPY[app.status]}</p>
              </div>
              <div className="text-right">
                <p className={`font-display text-3xl font-bold ${verifiedCount === requiredCount ? "text-success" : "text-text-primary"}`}>
                  {verifiedCount}<span className="text-lg text-text-muted">/{requiredCount}</span>
                </p>
                <p className="text-xs text-text-muted">documents verified</p>
              </div>
            </div>
            <div className="h-2 rounded-pill bg-border overflow-hidden">
              <div
                className={`h-full rounded-pill ${verifiedCount === requiredCount ? "bg-success" : "bg-signal"}`}
                style={{ width: `${requiredCount ? (verifiedCount / requiredCount) * 100 : 0}%` }}
              />
            </div>
          </Card>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <h2 className="font-display text-lg font-bold text-text-primary mb-4">Document checklist</h2>
              <div className="divide-y divide-border">
                {checklist.map((item) => {
                  const style = ICON[item.status] || ICON.missing;
                  const Icon = style.icon;
                  const doc = documents.find((entry) => entry.documentType === item.documentType);
                  return (
                    <div key={item.documentType} className="flex items-start gap-3 py-3">
                      <Icon size={17} className={`${style.className} mt-0.5 shrink-0`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-text-primary">{item.label}</p>
                        <p className="text-xs text-text-muted">
                          {item.status === "missing"
                            ? "Not uploaded"
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

            <div className="space-y-4">
              <Card className="!p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock size={14} className="text-success" />
                  <h2 className="font-display text-sm font-bold text-text-primary">Your documents are sealed</h2>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Each file was encrypted with its own key before being stored. That key is sealed for TNTEU and for
                  {" "}{app.collegeName} only. Nobody else — not other colleges, not faculty, not other applicants —
                  holds a key that can open them.
                </p>
              </Card>

              {app.status === "verified" && (
                <Card className="!p-4 border-success/40">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck size={14} className="text-success" />
                    <h2 className="font-display text-sm font-bold text-text-primary">What happens next</h2>
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    {app.collegeName} will create your student account and send you the login. From then on you sign
                    in on the main login page, where you can download your digitally signed certificates whenever you
                    need them.
                  </p>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </ApplyShell>
  );
}
