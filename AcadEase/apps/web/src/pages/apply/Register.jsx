import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Info } from "lucide-react";
import { applicantApi, useApplicant } from "../../context/ApplicantContext.jsx";
import ApplyShell from "./ApplyShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

const CATEGORIES = ["OC", "BC", "BCM", "MBC", "SC", "SCA", "ST", "DNC"];

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-text-secondary mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-text-muted mt-1">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-2 focus:ring-signal/30";

export default function ApplyRegister() {
  const navigate = useNavigate();
  const { register } = useApplicant();
  const { toast, showToast, clearToast } = useToast();

  const [options, setOptions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", confirm: "",
    program: "BEd", collegeId: "", dob: "", gender: "", category: "",
  });

  useEffect(() => {
    applicantApi.get("/applicant/options").then((res) => {
      setOptions(res.data);
      setForm((prev) => ({ ...prev, collegeId: res.data.colleges[0]?.collegeId || "" }));
    }).catch(() => showToast("Could not load the list of universities.", "error"));
  }, []);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const selectedProgram = options?.programs.find((p) => p.program === form.program);

  async function submit(event) {
    event.preventDefault();
    if (form.password !== form.confirm) return showToast("The two passwords do not match.", "error");

    setBusy(true);
    try {
      const { confirm, ...payload } = form;
      const data = await register(payload);
      showToast(data.claimed ? data.message : "Application started.", "success");
      navigate("/apply/documents");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not start your application.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ApplyShell>
      <Toast toast={toast} onClose={clearToast} />

      <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Apply for admission</h1>
      <p className="text-sm text-text-secondary mb-8 max-w-2xl">
        Create a temporary application account, upload your certificates, and we will check each one as soon as it
        arrives. Your student account is created only after TNTEU has verified every document.
      </p>

      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={submit} className="lg:col-span-2">
          <Card className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name (as printed on your certificates)">
                <input required value={form.name} onChange={set("name")} className={inputClass} />
              </Field>
              <Field label="Date of birth" hint="DD-MM-YYYY">
                <input value={form.dob} onChange={set("dob")} placeholder="14-03-2002" className={inputClass} />
              </Field>
              <Field label="Email address" hint="This is your login">
                <input required type="email" value={form.email} onChange={set("email")} className={inputClass} />
              </Field>
              <Field label="Mobile number">
                <input value={form.phone} onChange={set("phone")} className={inputClass} />
              </Field>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Course you are applying for">
                <select value={form.program} onChange={set("program")} className={inputClass}>
                  {options?.programs.map((p) => (
                    <option key={p.program} value={p.program}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Category" hint="Reserved categories qualify at a lower minimum mark">
                <select value={form.category} onChange={set("category")} className={inputClass}>
                  <option value="">Select…</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <Field label="University you are applying to">
              <select required value={form.collegeId} onChange={set("collegeId")} className={inputClass}>
                {options?.colleges.map((c) => (
                  <option key={c.collegeId} value={c.collegeId}>{c.name} — {c.district}</option>
                ))}
              </select>
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Password" hint="At least 8 characters">
                <input required type="password" minLength={8} value={form.password} onChange={set("password")} className={inputClass} />
              </Field>
              <Field label="Confirm password">
                <input required type="password" value={form.confirm} onChange={set("confirm")} className={inputClass} />
              </Field>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Link to="/apply/login" className="text-sm text-signal font-semibold hover:underline">
                Already started? Sign in
              </Link>
              <Button type="submit" disabled={busy}>
                {busy ? "Starting…" : "Start application"} <ArrowRight size={15} className="ml-1.5" />
              </Button>
            </div>
          </Card>
        </form>

        <div className="space-y-4">
          {selectedProgram && (
            <Card className="!p-4">
              <h2 className="font-display text-sm font-bold text-text-primary mb-3">
                {selectedProgram.label} — what you will need
              </h2>
              <ul className="space-y-1.5 mb-4">
                {selectedProgram.requiredDocuments.map((doc) => (
                  <li key={doc.type} className="text-xs text-text-secondary flex gap-2">
                    <span className="text-text-muted">•</span> {doc.label}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-text-muted leading-relaxed border-t border-border pt-3">
                Minimum {selectedProgram.generalMinimum}% in your {selectedProgram.qualifyingLabel} —
                {" "}{selectedProgram.reservedMinimum}% for SC/ST/BC/MBC candidates.
              </p>
            </Card>
          )}

          <Card className="!p-4 bg-paper">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-signal mt-0.5 shrink-0" />
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Scan each certificate at <strong>200 DPI or higher</strong> and upload the original file — not a
                screenshot or a forwarded copy. Blurred, cropped and heavily compressed scans are rejected on upload,
                so you will know straight away rather than weeks later.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </ApplyShell>
  );
}
