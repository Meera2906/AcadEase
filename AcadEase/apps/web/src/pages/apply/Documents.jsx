import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, ShieldAlert,
  Lock, Trash2, Send, ScanLine, Info, ExternalLink, Loader2,
} from "lucide-react";
import { applicantApi, useApplicant } from "../../context/ApplicantContext.jsx";
import ApplyShell from "./ApplyShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const inputClass =
  "w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-2 focus:ring-signal/30";

// How each authenticity outcome is presented. Note that only `verified_source`
// is ever shown as green: an issuer link is explicitly *not* a verification.
const QR_PRESENTATION = {
  verified_source: { icon: ShieldCheck, tone: "success", title: "Authenticity confirmed" },
  issuer_reference: { icon: ScanLine, tone: "info", title: "Issuer QR found" },
  unrecognised_qr: { icon: ScanLine, tone: "warn", title: "Unrecognised QR" },
  absent: { icon: Info, tone: "muted", title: "No QR code" },
};

const TONES = {
  success: "bg-[#E9FCE0] border-[#b6f0cc] text-success",
  info: "bg-[#E8ECFF] border-[#c3ccff] text-signal",
  warn: "bg-[#FFF3DC] border-[#f5dfae] text-[#8a6300]",
  muted: "bg-paper border-border text-text-secondary",
  danger: "bg-[#FFE7E9] border-[#ffc0c7] text-danger",
};

function QrBadge({ qrCheck }) {
  if (!qrCheck?.status) return null;
  const view = QR_PRESENTATION[qrCheck.status] || QR_PRESENTATION.unrecognised_qr;
  const Icon = view.icon;
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-card border ${TONES[view.tone]}`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-bold">{view.title}</p>
        <p className="text-[11px] leading-relaxed opacity-90">{qrCheck.detail || qrCheck.headline}</p>
        {qrCheck.link && qrCheck.status === "issuer_reference" && (
          <a
            href={qrCheck.link} target="_blank" rel="noreferrer"
            className="text-[11px] font-semibold underline inline-flex items-center gap-1 mt-1"
          >
            Open the issuer's page <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

function DocumentRow({ item, doc, onUpload, onRemove, busy, disabled }) {
  const inputRef = useRef(null);
  const uploaded = Boolean(doc);

  return (
    <div className={`p-4 border rounded-card ${uploaded ? "border-border bg-card" : "border-dashed border-border bg-paper"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {uploaded ? (
            <CheckCircle2 size={17} className="text-success mt-0.5 shrink-0" />
          ) : (
            <UploadCloud size={17} className="text-text-muted mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">{item.label}</p>
            {uploaded ? (
              <p className="text-[11px] text-text-muted truncate">
                {doc.originalName} · {(doc.size / 1024).toFixed(0)} KB
                {doc.qualityMetrics?.estimatedDpi ? ` · ~${doc.qualityMetrics.estimatedDpi} DPI` : ""}
              </p>
            ) : (
              <p className="text-[11px] text-text-muted">Not uploaded yet</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(item.documentType, file);
              event.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant={uploaded ? "secondary" : "primary"}
            disabled={busy || disabled}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : uploaded ? "Replace" : "Upload"}
          </Button>
          {uploaded && !disabled && (
            <button
              onClick={() => onRemove(item.documentType)}
              title="Remove"
              className="w-8 h-8 flex items-center justify-center rounded-card text-text-muted hover:text-danger hover:bg-[#FFE7E9]"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {uploaded && (
        <div className="mt-3 space-y-2 pl-7">
          <QrBadge qrCheck={doc.qrCheck} />

          {doc.qualityWarnings?.map((warning) => (
            <div key={warning} className={`flex items-start gap-2 p-2.5 rounded-card border ${TONES.warn}`}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <p className="text-[11px]">{warning}</p>
            </div>
          ))}

          {doc.status === "rejected" && (
            <div className={`flex items-start gap-2 p-2.5 rounded-card border ${TONES.danger}`}>
              <XCircle size={13} className="mt-0.5 shrink-0" />
              <p className="text-[11px]">Rejected by TNTEU: {doc.rejectionReason}</p>
            </div>
          )}

          <p className="text-[10px] text-text-muted flex items-center gap-1">
            <Lock size={9} /> Encrypted — readable only by TNTEU and your university
          </p>
        </div>
      )}
    </div>
  );
}

export default function ApplyDocuments() {
  const navigate = useNavigate();
  const { applicant, setApplicant, booting } = useApplicant();
  const { toast, showToast, clearToast } = useToast();

  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState(null);
  const [rejection, setRejection] = useState(null);
  const [marks, setMarks] = useState({});
  const [savingMarks, setSavingMarks] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await applicantApi.get("/applicant/me");
      setView(data);
      setApplicant(data.applicant);
      setMarks({
        tenthPercentage: data.applicant.tenthPercentage ?? "",
        twelfthPercentage: data.applicant.twelfthPercentage ?? "",
        ugPercentage: data.applicant.ugPercentage ?? "",
        bedPercentage: data.applicant.bedPercentage ?? "",
        category: data.applicant.category ?? "",
      });
    } catch {
      navigate("/apply/login");
    } finally {
      setLoading(false);
    }
  }, [navigate, setApplicant]);

  useEffect(() => {
    if (booting) return;
    if (!applicant) { navigate("/apply/login"); return; }
    load();
  }, [booting, applicant?.applicantId]);

  async function upload(documentType, file) {
    setBusyType(documentType);
    setRejection(null);
    const form = new FormData();
    form.append("file", file);
    form.append("documentType", documentType);

    try {
      const { data } = await applicantApi.post("/applicant/documents", form);
      setView(data.application);
      showToast(
        data.qrCheck.status === "verified_source"
          ? `${data.label} accepted — authenticity confirmed against the issuing record.`
          : `${data.label} accepted and encrypted.`,
        "success"
      );
    } catch (err) {
      const body = err.response?.data;
      // A refusal is the useful case: show exactly what is wrong so the
      // applicant can fix it now rather than after a rejection weeks later.
      setRejection({
        documentType,
        error: body?.error || "Upload failed",
        problems: body?.problems || [],
        stage: body?.stage,
      });
      showToast(body?.error || "Upload failed.", "error");
    } finally {
      setBusyType(null);
    }
  }

  async function remove(documentType) {
    try {
      const { data } = await applicantApi.delete(`/applicant/documents/${documentType}`);
      setView(data.application);
      showToast("Document removed.", "success");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not remove.", "error");
    }
  }

  async function saveMarks() {
    setSavingMarks(true);
    try {
      const { data } = await applicantApi.patch("/applicant/me", marks);
      setView(data);
      setApplicant(data.applicant);
      showToast("Saved.", "success");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not save.", "error");
    } finally {
      setSavingMarks(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const { data } = await applicantApi.post("/applicant/submit");
      setView(data.application);
      setApplicant(data.application.applicant);
      showToast("Application submitted to TNTEU.", "success");
      navigate("/apply/status");
    } catch (err) {
      const body = err.response?.data;
      showToast([body?.error, ...(body?.blockers || [])].filter(Boolean).join(" "), "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (booting || loading) {
    return <ApplyShell><div className="h-64 bg-white border border-border rounded-card animate-pulse" /></ApplyShell>;
  }
  if (!view) return null;

  const { checklist, documents, eligibility, missingRequired, canSubmit } = view;
  const isDraft = view.applicant.stage === "draft";
  const byType = new Map(documents.map((doc) => [doc.documentType, doc]));
  const needsBed = view.applicant.program === "MEd";

  return (
    <ApplyShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Your documents</h1>
      <p className="text-sm text-text-secondary mb-6 max-w-2xl">
        Upload each certificate below. Every file is checked the instant it arrives — legibility, QR authenticity and
        whether anyone else has already submitted the same file — and then encrypted before it is stored.
      </p>

      {!isDraft && (
        <div className={`mb-6 p-3 rounded-card border ${TONES.info}`}>
          <p className="text-sm font-semibold">Your application has been submitted</p>
          <p className="text-xs mt-0.5">
            Documents can no longer be changed here. Track progress on the status page.
          </p>
        </div>
      )}

      {rejection && (
        <Card className="mb-6 border-danger/40 bg-[#FFE7E9]">
          <div className="flex items-start gap-3">
            <ShieldAlert size={18} className="text-danger mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-danger">{rejection.error}</p>
              <ul className="mt-2 space-y-1">
                {rejection.problems.map((problem) => (
                  <li key={problem} className="text-xs text-danger/90 leading-relaxed">• {problem}</li>
                ))}
              </ul>
              <p className="text-[11px] text-danger/70 mt-2">
                The file was not stored. Fix the issue and upload again.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {checklist.map((item) => (
            <DocumentRow
              key={item.documentType}
              item={item}
              doc={byType.get(item.documentType)}
              onUpload={upload}
              onRemove={remove}
              busy={busyType === item.documentType}
              disabled={!isDraft}
            />
          ))}

          {documents
            .filter((doc) => !checklist.some((item) => item.documentType === doc.documentType))
            .map((doc) => (
              <DocumentRow
                key={doc.documentType}
                item={{ documentType: doc.documentType, label: `${doc.label} (optional)` }}
                doc={doc}
                onUpload={upload}
                onRemove={remove}
                busy={busyType === doc.documentType}
                disabled={!isDraft}
              />
            ))}
        </div>

        <div className="space-y-4">
          {/* Declared marks drive the eligibility gate */}
          <Card className="!p-4">
            <h2 className="font-display text-sm font-bold text-text-primary mb-1">Your marks</h2>
            <p className="text-[11px] text-text-muted mb-3">
              These decide whether you qualify. TNTEU checks them against your uploaded certificates.
            </p>

            <div className="space-y-2.5">
              {[
                ["tenthPercentage", "10th %"],
                ["twelfthPercentage", "12th %"],
                ["ugPercentage", "UG degree %"],
                ...(needsBed ? [["bedPercentage", "B.Ed degree %"]] : []),
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary flex-1">{label}</span>
                  <input
                    type="number" min="0" max="100" step="0.01" disabled={!isDraft}
                    value={marks[key] ?? ""}
                    onChange={(event) => setMarks((prev) => ({ ...prev, [key]: event.target.value }))}
                    className="w-24 px-2 py-1.5 text-sm border border-border rounded-card disabled:bg-paper focus:outline-none focus:ring-2 focus:ring-signal/30"
                  />
                </label>
              ))}
              <label className="flex items-center gap-2">
                <span className="text-xs text-text-secondary flex-1">Category</span>
                <select
                  disabled={!isDraft}
                  value={marks.category ?? ""}
                  onChange={(event) => setMarks((prev) => ({ ...prev, category: event.target.value }))}
                  className="w-24 px-2 py-1.5 text-sm border border-border rounded-card disabled:bg-paper"
                >
                  <option value="">—</option>
                  {["OC", "BC", "BCM", "MBC", "SC", "SCA", "ST", "DNC"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>

            {isDraft && (
              <Button size="sm" variant="secondary" className="w-full mt-3" disabled={savingMarks} onClick={saveMarks}>
                {savingMarks ? "Saving…" : "Save marks"}
              </Button>
            )}
          </Card>

          {/* Eligibility verdict, rule by rule */}
          <Card className={`!p-4 ${eligibility.eligible ? "border-success/40" : ""}`}>
            <div className="flex items-center gap-2 mb-3">
              {eligibility.eligible
                ? <CheckCircle2 size={15} className="text-success" />
                : <AlertTriangle size={15} className="text-warning" />}
              <h2 className="font-display text-sm font-bold text-text-primary">
                {eligibility.eligible ? "You meet the criteria" : "Eligibility"}
              </h2>
            </div>

            <div className="space-y-1.5">
              {eligibility.checks.map((check) => (
                <div key={check.rule} className="flex items-start gap-2">
                  {check.passed
                    ? <CheckCircle2 size={12} className="text-success mt-0.5 shrink-0" />
                    : <XCircle size={12} className="text-text-muted mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-[11px] text-text-primary">{check.label}</p>
                    <p className="text-[10px] text-text-muted">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {eligibility.blockers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-1">
                {eligibility.blockers.map((blocker) => (
                  <p key={blocker} className="text-[11px] text-danger leading-relaxed">{blocker}</p>
                ))}
              </div>
            )}
          </Card>

          {isDraft && (
            <Card className="!p-4">
              <h2 className="font-display text-sm font-bold text-text-primary mb-2">Submit to TNTEU</h2>
              {missingRequired.length > 0 && (
                <p className="text-[11px] text-warning mb-2">
                  {missingRequired.length} required document(s) still missing.
                </p>
              )}
              {!eligibility.eligible && missingRequired.length === 0 && (
                <p className="text-[11px] text-warning mb-2">Fill in your marks to check eligibility.</p>
              )}
              <Button className="w-full" disabled={!canSubmit || submitting} onClick={submit}>
                <Send size={14} className="mr-1.5" />
                {submitting ? "Submitting…" : "Submit application"}
              </Button>
              <p className="text-[10px] text-text-muted mt-2 leading-relaxed">
                Once submitted, your documents enter TNTEU's verification queue and can no longer be edited here.
              </p>
            </Card>
          )}
        </div>
      </div>
    </ApplyShell>
  );
}
