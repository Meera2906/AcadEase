import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApplicant } from "../../context/ApplicantContext.jsx";
import ApplyShell from "./ApplyShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

export default function ApplyLogin() {
  const navigate = useNavigate();
  const { login } = useApplicant();
  const { toast, showToast, clearToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await login(email, password);
      navigate(data.applicant.stage === "draft" ? "/apply/documents" : "/apply/status");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not sign in.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ApplyShell>
      <Toast toast={toast} onClose={clearToast} />

      <div className="max-w-md mx-auto mt-8">
        <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Continue your application</h1>
        <p className="text-sm text-text-secondary mb-6">
          This is the temporary login you created when you started applying. Once you are admitted you will sign in
          with a student ID on the main login page instead.
        </p>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-semibold text-text-secondary mb-1">Email address</span>
              <input
                required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-signal/30"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-secondary mb-1">Password</span>
              <input
                required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-2 focus:ring-signal/30"
              />
            </label>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-xs text-text-secondary mt-4 pt-4 border-t border-border text-center">
            Not started yet? <Link to="/apply" className="text-signal font-semibold hover:underline">Apply for admission</Link>
          </p>
        </Card>
      </div>
    </ApplyShell>
  );
}
