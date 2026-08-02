import { useRef, useState } from "react";
import {
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw, UploadCloud, FileText, X, Fingerprint,
} from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

// Two independent verdicts, deliberately shown apart: whether the *record* is
// genuine, and whether the *file* is the one we generated. A forged printout
// wrapped around a real QR code passes the first and fails the second.
const RECORD_TONE = {
  valid: { bg: "bg-[#E9FCE0]", text: "text-success", Icon: ShieldCheck, title: "Genuine certificate" },
  superseded: { bg: "bg-[#E8ECFF]", text: "text-signal", Icon: RefreshCw, title: "Superseded — a corrected certificate was issued" },
  invalid: { bg: "bg-[#FFE7E9]", text: "text-danger", Icon: ShieldX, title: "Not valid" },
  unreadable: { bg: "bg-[#FFF3DC]", text: "text-warning", Icon: ShieldAlert, title: "Could not be read" },
};

const FILE_TONE = {
  exact: "bg-[#E9FCE0] text-success",
  different: "bg-[#FFF3DC] text-warning",
  unavailable: "bg-[#F1EFE6] text-text-secondary",
  no_record: "bg-[#FFE7E9] text-danger",
  not_checked: "bg-[#F1EFE6] text-text-secondary",
};

function Row({ label, value, mono = false }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-text-muted shrink-0">{label}</span>
      <span className={`text-xs text-text-primary text-right break-all ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

export default function FacultyCertificateVerify() {
  const [file, setFile] = useState(null);
  const [certId, setCertId] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const { toast, showToast, clearToast } = useToast();

  async function verify(e) {
    e?.preventDefault();
    if (!file && !certId.trim()) return showToast("Add the certificate file, or paste its ID.", "error");

    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      if (file) form.append("file", file);
      if (certId.trim()) form.append("certId", certId.trim());
      const { data } = await api.post("/certificates/verify-upload", form);
      setResult(data);
    } catch (err) {
      // A refusal is still an answer worth showing — 404 means "no such
      // certificate was ever issued", which is the most important verdict here.
      if (err.response?.data) setResult(err.response.data);
      else showToast("Could not reach the verification service.", "error");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setCertId("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const tone = !result
    ? null
    : result.readable === false || result.error
      ? RECORD_TONE.unreadable
      : result.verified
        ? RECORD_TONE.valid
        : result.superseded
          ? RECORD_TONE.superseded
          : RECORD_TONE.invalid;

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2 mb-1">
        <ShieldCheck size={22} className="text-citrus" /> Certificate Verification
      </h1>
      <p className="text-sm text-text-secondary mb-6 max-w-2xl">
        Someone hands you a certificate — a printout, a PDF, a photo. Drop it here. The QR code is read, the issued
        record is checked against its signatures, and the file itself is hashed and compared with the copy this
        institution generated.
      </p>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <form onSubmit={verify} className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) { setFile(dropped); setResult(null); }
              }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-card px-5 py-8 text-center cursor-pointer transition-colors ${
                dragging ? "border-signal bg-[#EEF1FF]" : "border-border hover:border-signal/50 bg-paper"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm text-text-primary">
                  <FileText size={16} className="text-signal" />
                  <span className="font-medium truncate max-w-[16rem]">{file.name}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
                    className="text-text-muted hover:text-danger"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <UploadCloud size={26} className="mx-auto mb-2 text-text-muted" />
                  <p className="text-sm text-text-secondary font-medium">Drop the certificate here, or click to choose</p>
                  <p className="text-xs text-text-muted mt-1">PDF, JPG or PNG · up to 10 MB</p>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-wide text-text-muted">or if the QR will not scan</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div>
              <label className="label">Certificate ID or verification link</label>
              <input
                value={certId}
                onChange={(e) => { setCertId(e.target.value); setResult(null); }}
                placeholder="4b1f8c2e-… or https://…/verify/4b1f8c2e-…"
                className="input font-mono text-xs"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">
                {busy ? "Checking…" : "Verify certificate"}
              </Button>
              {(file || certId || result) && (
                <Button type="button" variant="secondary" onClick={reset}>Clear</Button>
              )}
            </div>
          </form>
        </Card>

        {/* Verdict */}
        <div>
          {!result ? (
            <Card className="h-full flex items-center justify-center text-center py-14">
              <div>
                <Fingerprint size={26} className="text-text-muted mx-auto mb-3" />
                <p className="text-sm text-text-secondary">The verdict appears here.</p>
                <p className="text-xs text-text-muted mt-1 max-w-xs mx-auto">
                  Nothing is uploaded anywhere else — the file is hashed and read on this institution's own server.
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className={`rounded-card px-5 py-5 text-center ${tone.bg}`}>
                <tone.Icon size={40} className={`${tone.text} mx-auto mb-2`} />
                <p className={`font-display text-base font-bold ${tone.text}`}>{tone.title}</p>
                <p className="text-sm text-text-secondary mt-1.5 max-w-sm mx-auto leading-relaxed">
                  {result.verdict || result.message || result.detail || result.error}
                </p>
                {result.superseded && result.supersededBy && (
                  <a
                    href={`/verify/${result.supersededBy}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-3 text-xs font-semibold text-signal underline break-all"
                  >
                    Open the replacement certificate →
                  </a>
                )}
              </div>

              {/* The file check, kept visibly separate from the record check. */}
              {result.fileMatch && (
                <div className={`rounded-card px-4 py-3 ${FILE_TONE[result.fileMatch] || FILE_TONE.not_checked}`}>
                  <p className="text-xs font-bold mb-1">
                    File check ·{" "}
                    {result.fileMatch === "exact" ? "matches the issued PDF"
                      : result.fileMatch === "different" ? "does NOT match the issued PDF"
                      : result.fileMatch === "unavailable" ? "not comparable"
                      : result.fileMatch === "no_record" ? "no record to compare against"
                      : "no file uploaded"}
                  </p>
                  <p className="text-xs leading-relaxed opacity-90">{result.fileMessage}</p>
                </div>
              )}

              {result.certId && (
                <Card className="!p-4">
                  <h2 className="font-display text-sm font-bold text-text-primary mb-2">What the record says</h2>
                  <p className="text-xs text-text-muted mb-3">
                    Read these against the document in front of you.
                  </p>
                  <Row label="Student" value={result.studentName} />
                  <Row label="Certificate type" value={result.certificateType} />
                  <Row label="Issued" value={result.issueDate ? new Date(result.issueDate).toDateString() : null} />
                  <Row label="Institution" value={result.institutionId} />
                  <Row label="Certificate ID" value={result.certId} mono />
                  <Row
                    label="Read from"
                    value={result.referenceSource === "qr" ? "QR code on the file"
                      : result.referenceSource === "pdf_link" ? "link inside the PDF"
                      : result.referenceSource === "typed" ? "the ID you pasted" : null}
                  />
                  <Row
                    label="HMAC signature"
                    value={<span className={result.signatureValid ? "text-success font-semibold" : "text-danger font-semibold"}>
                      {result.signatureValid ? "valid" : "invalid"}
                    </span>}
                  />
                  <Row
                    label="Approval chain"
                    value={<span className={result.chainValid ? "text-success font-semibold" : "text-danger font-semibold"}>
                      {result.chainValid ? "valid" : "broken"}
                    </span>}
                  />
                  {result.fileHash && <Row label="Uploaded file SHA-256" value={result.fileHash} mono />}
                  {result.expectedHash && <Row label="Issued file SHA-256" value={result.expectedHash} mono />}
                </Card>
              )}

              {result.approvals?.length > 0 && (
                <Card className="!p-4">
                  <h2 className="font-display text-sm font-bold text-text-primary mb-3">Who signed it</h2>
                  <ol className="space-y-2">
                    {result.approvals.map((a, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${a.signatureValid ? "bg-success" : "bg-danger"}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-text-primary">{a.label}</p>
                          <p className="text-[11px] text-text-muted">
                            {a.decidedBy} · {a.decidedAt ? new Date(a.decidedAt).toLocaleDateString("en-IN") : "—"}
                            {a.keyFingerprint ? ` · key ${String(a.keyFingerprint).slice(0, 12)}…` : ""}
                          </p>
                          {a.problem && <p className="text-[11px] text-danger mt-0.5">{a.problem}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
