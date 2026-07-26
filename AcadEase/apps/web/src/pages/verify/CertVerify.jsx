import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, XCircle, AlertTriangle, GraduationCap } from "lucide-react";
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
  const isRevoked = result?.status === "revoked";

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
          loading   ? "bg-paper" :
          isValid   ? "bg-[#E9FCE0]" :
          isRevoked ? "bg-[#FFE7E9]" :
                      "bg-[#FFF3DC]"
        }`}>
          {loading ? (
            <div className="w-12 h-12 rounded-full bg-[#EFEBDF] animate-pulse mx-auto mb-3" />
          ) : isValid ? (
            <CheckCircle size={48} className="text-success mx-auto mb-2" />
          ) : isRevoked ? (
            <XCircle size={48} className="text-danger mx-auto mb-2" />
          ) : (
            <AlertTriangle size={48} className="text-warning mx-auto mb-2" />
          )}

          <p className={`font-display text-lg font-bold ${
            loading   ? "text-text-muted" :
            isValid   ? "text-success" :
            isRevoked ? "text-danger" :
                        "text-warning"
          }`}>
            {loading    ? "Verifying…" :
             isValid    ? "Certificate Valid" :
             isRevoked  ? "Certificate Revoked" :
                          "Not Found"}
          </p>

          {!loading && !isValid && (
            <p className="text-sm text-text-secondary mt-1 max-w-xs mx-auto">
              {isRevoked
                ? "This certificate has been revoked by the institution."
                : result?.message || "This certificate could not be verified."}
            </p>
          )}
        </div>

        {/* Details */}
        {isValid && (
          <div className="px-6 py-5 space-y-3">
            <Row label="Student Name"      value={result.studentName} />
            <Row label="Certificate Type"  value={capitalize(result.certificateType)} />
            <Row label="Issue Date"        value={new Date(result.issueDate).toDateString()} />
            <Row label="Institution"       value={result.institutionId} />
            <Row label="Status"            value={<span className="text-success font-semibold">Active ✓</span>} />
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
