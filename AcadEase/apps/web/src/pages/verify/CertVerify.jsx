import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, XCircle, AlertTriangle, GraduationCap, ShieldCheck, RefreshCw } from "lucide-react";
import api from "../../api/client.js";

export default function CertVerify() {
  const { certId } = useParams();
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/certificates/verify/${certId}`)
      .then((res) => setResult(res.data))
      .catch((err) => setResult(err.response?.data || { verified: false, message: "This certificate could not be verified. Contact the institution." }))
      .finally(() => setLoading(false));
  }, [certId]);

  const isValid   = result?.verified === true;
  // A superseded certificate is not a withdrawn one: the record behind it was
  // corrected and a replacement was issued. Showing both the same way would
  // wrongly imply the student did something wrong.
  const isSuperseded = result?.superseded === true;
  const isRevoked = result?.status === "revoked" && !isSuperseded;
  const signatureValid = result?.signatureValid !== false;

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-4">
      {/* Brand */}
      <div className="flex items-center gap-2 mb-8">
        <GraduationCap size={24} className="text-signal" />
        <span className="font-display text-xl font-bold text-ink">
          Acad<span className="text-signal">Ease</span>
        </span>
      </div>

      <div className="w-full max-w-md bg-card border border-border rounded-card shadow-lift overflow-hidden">
        {/* Status header */}
        <div className={`px-6 py-6 text-center ${
          loading      ? "bg-paper" :
          isValid      ? "bg-[#E9FCE0]" :
          isSuperseded ? "bg-[#E8ECFF]" :
          isRevoked    ? "bg-[#FFE7E9]" :
                         "bg-[#FFF3DC]"
        }`}>
          {loading ? (
            <div className="w-12 h-12 rounded-full bg-[#EFEBDF] animate-pulse mx-auto mb-3" />
          ) : isValid ? (
            <CheckCircle size={48} className="text-success mx-auto mb-2" />
          ) : isSuperseded ? (
            <RefreshCw size={48} className="text-signal mx-auto mb-2" />
          ) : isRevoked ? (
            <XCircle size={48} className="text-danger mx-auto mb-2" />
          ) : (
            <AlertTriangle size={48} className="text-warning mx-auto mb-2" />
          )}

          <p className={`font-display text-lg font-bold ${
            loading      ? "text-text-muted" :
            isValid      ? "text-success" :
            isSuperseded ? "text-signal" :
            isRevoked    ? "text-danger" :
                           "text-warning"
          }`}>
            {loading      ? "Verifying…" :
             isValid      ? "Certificate Valid" :
             isSuperseded ? "Superseded — a corrected certificate was issued" :
             isRevoked    ? "Certificate Revoked" :
                            "Not Found"}
          </p>

          {!loading && !isValid && (
            <p className="text-sm text-text-secondary mt-1 max-w-xs mx-auto">
              {isRevoked
                ? "This certificate has been revoked by the institution."
                : result?.message || "This certificate could not be verified."}
            </p>
          )}

          {!loading && isSuperseded && result?.supersededBy && (
            <a
              href={`/verify/${result.supersededBy}`}
              className="inline-block mt-3 text-xs font-semibold text-signal underline break-all"
            >
              Verify the replacement certificate →
            </a>
          )}
        </div>

        {/* Details */}
        {isValid && (
          <div className="px-6 py-5 space-y-3">
            <Row label="Student Name"      value={result.studentName} />
            <Row label="Certificate Type"  value={capitalize(result.certificateType)} />
            <Row label="Issue Date"        value={new Date(result.issueDate).toDateString()} />
            <Row label="Institution"       value={result.institutionId} />
            <Row label="Signature"         value={<span className={signatureValid ? "text-success font-semibold" : "text-danger font-semibold"}>{signatureValid ? "Valid ✓" : "Invalid ✕"}</span>} />
            <Row label="Status"            value={<span className="text-success font-semibold">Active ✓</span>} />
          </div>
        )}

        {/* The authorisation chain. Each link was signed by a different
            institution with its own key; all of them are re-checked here from
            the public keys, so this page proves the chain rather than
            asserting it. */}
        {!loading && result?.approvals?.length > 0 && (
          <div className="px-6 py-5 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={15} className={result.chainValid ? "text-success" : "text-danger"} />
              <p className="text-sm font-display font-bold text-text-primary">
                Chain of authorisation
              </p>
            </div>

            <div className="space-y-3">
              {result.approvals.map((approval, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {approval.signatureValid
                      ? <CheckCircle size={15} className="text-success shrink-0" />
                      : <XCircle size={15} className="text-danger shrink-0" />}
                    {index < result.approvals.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="pb-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary">{approval.label}</p>
                    <p className="text-[11px] text-text-muted">
                      {approval.authority} · {approval.decidedBy} · {new Date(approval.decidedAt).toLocaleDateString()}
                    </p>
                    <p className="text-[10px] text-text-muted font-mono break-all">
                      {approval.algorithm} · key {String(approval.keyFingerprint || "").slice(0, 16)}
                    </p>
                    {!approval.signatureValid && (
                      <p className="text-[11px] text-danger font-semibold mt-0.5">{approval.problem}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-text-muted mt-3 pt-3 border-t border-border leading-relaxed">
              Each signature is checked against the issuing institution's public key. Anyone can verify these —
              only the key holder could have created them.
            </p>
          </div>
        )}

        <div className="px-6 py-4 bg-paper border-t border-border">
          <p className="text-xs text-text-muted text-center">
            Certificate ID: <span className="font-mono text-text-secondary">{certId}</span>
          </p>
          <p className="text-xs text-text-muted text-center mt-1">
            Verified by AcadEase · SKCET, Coimbatore
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm text-text-primary font-medium">{value}</span>
    </div>
  );
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}
