import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, XCircle, Clock, CircleDashed,
  FileWarning, Download, Info, ShieldCheck, ScanLine, ExternalLink, Lock,
} from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const CHECKLIST_ICON = {
  verified: { icon: CheckCircle2, className: "text-success" },
  rejected: { icon: XCircle, className: "text-danger" },
  pending: { icon: Clock, className: "text-warning" },
  missing: { icon: CircleDashed, className: "text-text-muted" },
};

const FIELD_LABELS = {
  name: "Name on document",
  registerNumber: "Register number",
  yearOfPassing: "Year of passing",
  university: "University / board",
  community: "Community",
  issueDate: "Date of issue",
  validUntil: "Valid until",
  dob: "Date of birth",
  idNumber: "ID number",
  percentage: "Percentage",
};

function FlagBanner({ flag, label, detail }) {
  const body = (() => {
    if (flag === "duplicate_hash" && detail) {
      return `This exact file (same SHA-256) was already submitted for applicant ${detail.applicantName || detail.applicantId} (${detail.applicantId}) at ${detail.collegeId} as their ${detail.documentType.replace(/_/g, " ")}.`;
    }
    if (flag === "missing_field" && detail?.fields) {
      return `Could not find: ${detail.fields.join(", ")}. Read the document and fill these in, or reject if they genuinely are not on it.`;
    }
    if (flag === "name_mismatch" && detail) {
      return `Document reads "${detail.onDocument}" but the applicant record says "${detail.onRecord}".`;
    }
    if (flag === "expired_document" && detail) {
      return `Validity lapsed on ${detail.validUntil}.`;
    }
    if (flag === "future_date" && detail) {
      return `Issue date reads ${detail.issueDate}, which is in the future.`;
    }
    if (flag === "unreadable") {
      return "No machine-readable text layer — nothing could be pre-filled. Read the file in the preview and type the fields yourself.";
    }
    if (flag === "duplicate_resubmit" && detail) {
      return `The same file was also submitted for this applicant as their ${detail.documentType.replace(/_/g, " ")}.`;
    }
    return label;
  })();

  const severe = flag === "duplicate_hash" || flag === "name_mismatch";

  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-card border ${severe ? "bg-[#FFE7E9] border-[#ffc0c7]" : "bg-[#FFF3DC] border-[#f5dfae]"}`}>
      <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${severe ? "text-danger" : "text-warning"}`} />
      <div>
        <p className={`text-xs font-bold ${severe ? "text-danger" : "text-warning"}`}>{label}</p>
        <p className={`text-xs mt-0.5 leading-relaxed ${severe ? "text-danger/90" : "text-[#8a6300]"}`}>{body}</p>
      </div>
    </div>
  );
}

export default function VerificationReview() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { toast, showToast, clearToast } = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState({});
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(false);
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admissions/documents/${documentId}`);
      setData(res.data);

      // Seed the form with the assistive pre-fill, plus a blank box for every
      // field this document type is expected to carry.
      const seeded = { ...res.data.document.extractedFields };
      res.data.document.expectedFields.forEach((field) => {
        if (seeded[field] === undefined) seeded[field] = "";
      });
      setFields(seeded);
    } catch (err) {
      showToast(err.response?.data?.error || "Document not found.", "error");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  // The file is never publicly reachable — fetch it with the access token and
  // render it from an in-memory object URL.
  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    api
      .get(`/admissions/documents/${documentId}/file`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setPreviewUrl(objectUrl);
      })
      .catch(() => !cancelled && setPreviewError(true));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  const isImage = useMemo(() => (data?.document.mimeType || "").startsWith("image/"), [data]);

  async function verify() {
    setBusy("verify");
    try {
      const res = await api.patch(`/admissions/documents/${documentId}/verify`, { extractedFields: fields });
      showToast(
        `Verified. ${res.data.applicantStatus === "verified"
          ? "All required documents are now verified — the applicant can be enrolled."
          : `${res.data.verifiedCount} of ${res.data.requiredCount} required documents verified.`}`,
        "success"
      );
      navigate("/admin/verification");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not verify.", "error");
      setBusy(null);
    }
  }

  async function reject() {
    if (reason.trim().length < 5) return showToast("Give a reason of at least 5 characters.", "error");
    setBusy("reject");
    try {
      await api.patch(`/admissions/documents/${documentId}/reject`, { reason: reason.trim() });
      showToast("Rejected. The university has been notified.", "success");
      navigate("/admin/verification");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not reject.", "error");
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="h-96 bg-white border border-border rounded-card animate-pulse" />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <Card className="text-center py-12"><p className="text-sm text-text-secondary">Document not found.</p></Card>
      </AppShell>
    );
  }

  const { document: doc, applicant, collegeName, checklist, verifiedCount, requiredCount, duplicateOf, flagLabels, eligibility } = data;
  const decided = doc.status !== "pending";

  const qr = doc.qrCheck || {};
  const QR_VIEW = {
    verified_source: { tone: "bg-[#E9FCE0] border-[#b6f0cc] text-success", icon: ShieldCheck, title: "Authenticity confirmed" },
    issuer_reference: { tone: "bg-[#E8ECFF] border-[#c3ccff] text-signal", icon: ScanLine, title: "Issuer verification link" },
    unrecognised_qr: { tone: "bg-[#FFF3DC] border-[#f5dfae] text-[#8a6300]", icon: ScanLine, title: "Unrecognised QR code" },
    absent: { tone: "bg-paper border-border text-text-secondary", icon: Info, title: "No QR code" },
  };
  const qrView = QR_VIEW[qr.status] || QR_VIEW.absent;
  const QrIcon = qrView.icon;

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <Link to="/admin/verification" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-signal mb-4">
        <ArrowLeft size={15} /> Back to queue
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">{doc.label}</h1>
          <p className="text-sm text-text-secondary">
            <Link to={`/admin/admissions/applicants/${applicant?.applicantId}`} className="font-semibold hover:text-signal">
              {applicant?.name}
            </Link>{" "}
            · <span className="font-mono">{applicant?.applicantId}</span> · {applicant?.program} · {collegeName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted">Applicant checklist</p>
          <p className={`text-sm font-bold ${verifiedCount === requiredCount ? "text-success" : "text-text-primary"}`}>
            {verifiedCount} of {requiredCount} required documents verified
          </p>
        </div>
      </div>

      {decided && (
        <div className="mb-5 p-3 rounded-card bg-paper border border-border text-sm text-text-secondary">
          This document was already <strong>{doc.status}</strong>
          {doc.verifiedBy ? ` by ${doc.verifiedBy}` : ""}
          {doc.verifiedAt ? ` on ${new Date(doc.verifiedAt).toLocaleString()}` : ""}
          {doc.rejectionReason ? ` — ${doc.rejectionReason}` : ""}.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left — the document itself */}
        <Card className="!p-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-paper">
            <p className="text-xs font-semibold text-text-secondary">
              {doc.originalName} · {(doc.size / 1024).toFixed(0)} KB
            </p>
            {previewUrl && (
              <a href={previewUrl} download={doc.originalName} className="text-xs text-signal font-semibold hover:underline flex items-center gap-1">
                <Download size={12} /> Download
              </a>
            )}
          </div>

          <div className="flex-1 min-h-[520px] bg-[#F5F4EF] flex items-center justify-center">
            {previewError ? (
              <div className="text-center p-8">
                <FileWarning size={26} className="text-danger mx-auto mb-2" />
                <p className="text-sm text-text-secondary">The stored file could not be loaded.</p>
              </div>
            ) : !previewUrl ? (
              <p className="text-sm text-text-muted">Loading document…</p>
            ) : isImage ? (
              <img src={previewUrl} alt="Submitted document" className="max-w-full max-h-[620px] object-contain" />
            ) : (
              <iframe title="Submitted document" src={previewUrl} className="w-full h-[620px] border-0" />
            )}
          </div>

          <div className="px-4 py-2 border-t border-border space-y-1">
            <p className="text-[11px] text-text-muted font-mono break-all">SHA-256 {doc.fileHash}</p>
            {doc.readableBy?.length > 0 && (
              <p className="text-[11px] text-text-muted flex items-center gap-1">
                <Lock size={9} /> Encrypted at rest · decryptable by {doc.readableBy.join(" and ")}
              </p>
            )}
          </div>
        </Card>

        {/* Right — authenticity, flags, fields, decision */}
        <div className="space-y-4">
          {/* What the QR check could and could not establish. Only a
              verified_source is presented as a confirmation. */}
          {qr.status && (
            <div className={`flex items-start gap-2.5 p-3 rounded-card border ${qrView.tone}`}>
              <QrIcon size={15} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold">{qrView.title}</p>
                <p className="text-xs mt-0.5 leading-relaxed opacity-90">{qr.detail || qr.headline}</p>
                {qr.link && qr.status === "issuer_reference" && (
                  <a
                    href={qr.link} target="_blank" rel="noreferrer"
                    className="text-xs font-semibold underline inline-flex items-center gap-1 mt-1.5"
                  >
                    Open {qr.issuerHost} and confirm <ExternalLink size={11} />
                  </a>
                )}
                {qr.status === "unrecognised_qr" && qr.payloads?.length > 0 && (
                  <p className="text-[11px] font-mono mt-1 break-all opacity-80">{qr.payloads[0]}</p>
                )}
              </div>
            </div>
          )}

          {eligibility && !eligibility.eligible && (
            <div className="flex items-start gap-2.5 p-3 rounded-card border bg-[#FFF3DC] border-[#f5dfae]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="text-xs font-bold text-warning">
                  Applicant does not currently meet {eligibility.programLabel} criteria
                </p>
                <p className="text-xs text-[#8a6300] mt-0.5 leading-relaxed">
                  {eligibility.blockers.join(" ") ||
                    `Marks not declared: ${eligibility.missing.join(", ")}.`}{" "}
                  Verifying documents is still correct — enrolment is blocked separately.
                </p>
              </div>
            </div>
          )}

          {doc.flags?.length > 0 ? (
            <div className="space-y-2">
              {doc.flags.map((flag) => (
                <FlagBanner
                  key={flag}
                  flag={flag}
                  label={flagLabels[flag] || flag}
                  detail={flag === "duplicate_hash" ? duplicateOf || doc.flagDetails?.[flag] : doc.flagDetails?.[flag]}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 p-3 rounded-card bg-[#E9FCE0] border border-[#b6f0cc]">
              <CheckCircle2 size={15} className="text-success shrink-0" />
              <p className="text-xs text-success font-medium">
                No automated checks were triggered on this document. Still confirm the fields against the image.
              </p>
            </div>
          )}

          <Card>
            <div className="flex items-start gap-2 mb-4">
              <Info size={14} className="text-signal mt-0.5 shrink-0" />
              <p className="text-xs text-text-secondary leading-relaxed">
                {doc.extractionSource === "pdf_text"
                  ? "These fields were read off the document text to save you typing. They are not trusted — check each one against the preview and correct anything wrong."
                  : "Nothing could be read from this file automatically. Read the preview and enter the fields yourself."}
              </p>
            </div>

            <div className="space-y-3">
              {Object.keys(fields).map((key) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    {FIELD_LABELS[key] || key}
                    {doc.flagDetails?.missing_field?.fields?.includes(key) && (
                      <span className="ml-1.5 text-warning font-normal">not found — enter manually</span>
                    )}
                  </label>
                  <input
                    value={fields[key]}
                    disabled={decided}
                    onChange={(event) => setFields((prev) => ({ ...prev, [key]: event.target.value }))}
                    className={`w-full px-3 py-2 text-sm border rounded-card focus:outline-none focus:ring-2 focus:ring-signal/30 disabled:bg-paper ${
                      key === "name" && doc.flags?.includes("name_mismatch") ? "border-danger" : "border-border"
                    }`}
                  />
                  {key === "name" && applicant && (
                    <p className="text-[11px] text-text-muted mt-1">Applicant record: {applicant.name}</p>
                  )}
                </div>
              ))}
            </div>

            {!decided && (
              <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
                <Button variant="success" disabled={busy} onClick={verify}>
                  <CheckCircle2 size={15} className="mr-1.5" />
                  {busy === "verify" ? "Verifying…" : "Confirm fields & verify"}
                </Button>
                <Button variant="destructive" disabled={busy} onClick={() => setShowReject((open) => !open)}>
                  <XCircle size={15} className="mr-1.5" /> Reject
                </Button>
              </div>
            )}

            {showReject && !decided && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Reason for rejection (sent to the university, recorded in the audit log)
                </label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  placeholder="e.g. Marksheet belongs to a different candidate — name and register number do not match the application."
                  className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-danger/30"
                />
                <Button variant="destructive" size="sm" className="mt-2" disabled={busy} onClick={reject}>
                  {busy === "reject" ? "Rejecting…" : "Confirm rejection"}
                </Button>
              </div>
            )}
          </Card>

          <Card className="!p-4">
            <h2 className="font-display text-sm font-bold text-text-primary mb-3">
              This applicant&apos;s checklist
            </h2>
            <div className="space-y-2">
              {checklist.map((item) => {
                const style = CHECKLIST_ICON[item.status] || CHECKLIST_ICON.missing;
                const Icon = style.icon;
                const isCurrent = item.documentType === doc.documentType;
                return (
                  <div key={item.documentType} className={`flex items-center gap-2 text-xs ${isCurrent ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                    <Icon size={14} className={`${style.className} shrink-0`} />
                    <span className="flex-1">{item.label}</span>
                    {isCurrent ? (
                      <span className="text-signal">reviewing now</span>
                    ) : item.documentId && item.status === "pending" ? (
                      <Link to={`/admin/verification/${item.documentId}`} className="text-signal hover:underline">open</Link>
                    ) : (
                      <span className="text-text-muted">{item.status}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-text-muted mt-3 pt-3 border-t border-border leading-relaxed">
              Verifying this document does not admit the applicant. Their status only turns
              <span className="font-semibold"> verified</span> once every item above is verified.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
