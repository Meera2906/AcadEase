import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadCloud, FileSpreadsheet, FileCheck2, AlertTriangle, CheckCircle2, XCircle, Info } from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const OUTCOME_STYLES = {
  imported: { icon: CheckCircle2, className: "text-success", label: "Imported" },
  flagged: { icon: AlertTriangle, className: "text-warning", label: "Flagged" },
  failed: { icon: XCircle, className: "text-danger", label: "Rejected" },
};

function ReportTable({ report, keyField }) {
  if (!report?.rows?.length) return null;

  return (
    <div className="mt-5 border border-border rounded-card overflow-hidden">
      <div className="grid grid-cols-4 gap-3 px-4 py-2.5 bg-paper border-b border-border text-xs font-semibold text-text-secondary">
        <span>{keyField === "file" ? "File" : "Row"}</span>
        <span>Applicant</span>
        <span>Outcome</span>
        <span>Detail</span>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-border">
        {report.rows.map((row, index) => {
          const style = OUTCOME_STYLES[row.outcome] || OUTCOME_STYLES.failed;
          const Icon = style.icon;
          return (
            <div key={index} className="grid grid-cols-4 gap-3 px-4 py-2.5 text-xs items-start">
              <span className="font-mono text-text-secondary break-all">
                {keyField === "file" ? row.file : `Line ${row.row}`}
              </span>
              <span className="text-text-primary">
                {row.applicantName || row.name || row.applicantId || "—"}
                {row.documentType && <span className="block text-text-muted">{row.documentType}</span>}
              </span>
              <span className={`flex items-center gap-1.5 font-semibold ${style.className}`}>
                <Icon size={13} /> {style.label}
              </span>
              <span className="text-text-secondary">
                {row.errors?.length > 0 && <span className="text-danger">{row.errors.join("; ")}</span>}
                {row.flags?.length > 0 && (
                  <span className="text-warning">{row.flags.join(", ")}</span>
                )}
                {!row.errors?.length && !row.flags?.length && "—"}
              </span>
            </div>
          );
        })}
      </div>
      {report.truncatedRows > 0 && (
        <p className="px-4 py-2 text-xs text-text-muted bg-paper border-t border-border">
          + {report.truncatedRows} more row(s) not shown in this report.
        </p>
      )}
    </div>
  );
}

function Summary({ report }) {
  if (!report) return null;
  return (
    <div className="flex flex-wrap gap-4 mt-4 text-sm">
      <span className="text-success font-semibold">{report.imported} imported</span>
      {typeof report.flagged === "number" && (
        <span className="text-warning font-semibold">{report.flagged} flagged for review</span>
      )}
      <span className="text-danger font-semibold">{report.failed} rejected</span>
      <span className="text-text-muted">{report.totalRows} total</span>
    </div>
  );
}

export default function AdmissionsUpload() {
  const { user } = useAuth();
  const isTnteu = user?.role === "tnteu_admin";
  const { toast, showToast, clearToast } = useToast();

  const [csvFile, setCsvFile] = useState(null);
  const [docFiles, setDocFiles] = useState([]);
  const [collegeId, setCollegeId] = useState("");
  const [meta, setMeta] = useState(null);
  const [csvReport, setCsvReport] = useState(null);
  const [docReport, setDocReport] = useState(null);
  const [busy, setBusy] = useState(null);

  const csvInput = useRef(null);
  const docInput = useRef(null);

  useEffect(() => {
    api.get("/admissions/meta").then((res) => setMeta(res.data)).catch(() => {});
  }, []);

  async function submitCsv(event) {
    event.preventDefault();
    if (!csvFile) return showToast("Choose a CSV file first.", "error");
    if (isTnteu && !collegeId.trim()) return showToast("Enter the university ID this batch belongs to.", "error");

    const form = new FormData();
    form.append("file", csvFile);
    if (isTnteu) form.append("collegeId", collegeId.trim());

    setBusy("csv");
    try {
      const res = await api.post("/admissions/batches/applicants", form);
      setCsvReport(res.data);
      showToast(res.data.message, res.data.failed ? "error" : "success");
    } catch (err) {
      showToast(err.response?.data?.error || "Import failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function submitDocs(event) {
    event.preventDefault();
    if (!docFiles.length) return showToast("Choose the document files first.", "error");

    const form = new FormData();
    docFiles.forEach((file) => form.append("files", file));

    setBusy("docs");
    try {
      const res = await api.post("/admissions/batches/documents", form);
      setDocReport(res.data);
      showToast(res.data.message, res.data.failed ? "error" : "success");
    } catch (err) {
      showToast(err.response?.data?.error || "Upload failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Bulk Admission Submission</h1>
      <p className="text-sm text-text-secondary mb-6">
        Submit your applicant list and their admission proofs to TNTEU in one go. Every file is hashed and
        checked on arrival, and you get a per-row report — nothing is inserted silently.
      </p>

      {/* Step 1 — applicants */}
      <Card className="mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-pill bg-signal/10 text-signal flex items-center justify-center shrink-0">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-text-primary">Step 1 · Applicant list (CSV)</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Columns: <span className="font-mono">applicantId, name, program, dob, gender, email, phone, rollNumber, category</span>.
              Program must be <span className="font-mono">BEd</span> or <span className="font-mono">MEd</span>.
            </p>
          </div>
        </div>

        <form onSubmit={submitCsv} className="space-y-3">
          {isTnteu && (
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                University ID (TNTEU staff must specify which university this batch is for)
              </label>
              <input
                value={collegeId}
                onChange={(event) => setCollegeId(event.target.value)}
                placeholder="TNTEU_COL_0417"
                className="w-full md:w-80 px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-signal/30"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={csvInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
              className="text-sm text-text-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-pill file:border-0 file:text-xs file:font-semibold file:bg-paper file:text-text-primary"
            />
            <Button type="submit" disabled={busy === "csv"}>
              {busy === "csv" ? "Importing…" : "Import applicants"}
            </Button>
          </div>
        </form>

        <Summary report={csvReport} />
        <ReportTable report={csvReport} keyField="row" />
      </Card>

      {/* Step 2 — documents */}
      <Card className="mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-pill bg-citrus/25 text-ink flex items-center justify-center shrink-0">
            <UploadCloud size={18} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-text-primary">Step 2 · Admission proofs</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Name each file <span className="font-mono">&lt;applicantId&gt;__&lt;documentType&gt;.pdf</span> — for example{" "}
              <span className="font-mono">APP_2025_001__10th_marksheet.pdf</span>. Roll numbers work in place of the
              applicant ID. PDF, JPG or PNG, up to 10 MB each, 40 files per upload.
            </p>
          </div>
        </div>

        {meta && (
          <div className="mb-4 p-3 bg-paper rounded-card border border-border">
            <p className="text-xs font-semibold text-text-secondary mb-2">Accepted document types</p>
            <div className="flex flex-wrap gap-1.5">
              {meta.documentTypes.map((item) => (
                <span key={item.type} className="px-2 py-1 rounded-pill bg-white border border-border text-[11px] font-mono text-text-secondary">
                  {item.type}
                </span>
              ))}
            </div>
            <p className="text-xs text-text-secondary mt-3">
              Required for <strong>B.Ed</strong>: {meta.requiredDocuments.BEd.join(", ")}
              <br />
              Required for <strong>M.Ed</strong>: {meta.requiredDocuments.MEd.join(", ")}
            </p>
          </div>
        )}

        <form onSubmit={submitDocs} className="flex flex-wrap items-center gap-3">
          <input
            ref={docInput}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(event) => setDocFiles([...(event.target.files || [])])}
            className="text-sm text-text-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-pill file:border-0 file:text-xs file:font-semibold file:bg-paper file:text-text-primary"
          />
          <Button type="submit" variant="citrus" disabled={busy === "docs"}>
            {busy === "docs" ? "Uploading…" : `Upload ${docFiles.length || ""} document${docFiles.length === 1 ? "" : "s"}`}
          </Button>
        </form>

        <Summary report={docReport} />
        <ReportTable report={docReport} keyField="file" />
      </Card>

      <Card className="bg-paper">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-signal mt-0.5 shrink-0" />
          <div className="text-xs text-text-secondary leading-relaxed">
            <p className="font-semibold text-text-primary mb-1">What happens after you submit</p>
            <p>
              Each file is hashed (SHA-256) and run through deterministic checks — duplicate file across the whole
              system, missing expected fields, name mismatch against your CSV row, lapsed validity dates. Flagged
              documents go to the top of TNTEU&apos;s review queue. <strong>Nothing is approved or rejected
              automatically</strong>; a TNTEU reviewer makes every call, and you will be notified of the outcome.
            </p>
            <Link to="/admin/admissions/applicants" className="inline-block mt-2 text-signal font-semibold hover:underline">
              Track your applicants →
            </Link>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
