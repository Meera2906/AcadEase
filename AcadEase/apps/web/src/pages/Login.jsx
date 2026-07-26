import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import Button from "../components/ui/Button.jsx";

const ROLE_HOME = {
  student:    "/student/dashboard",
  faculty:    "/faculty/attendance",
  admin:      "/admin/dashboard",
  superadmin: "/admin/dashboard",
};

export default function Login() {
  const { login, verifyTotp, loading } = useAuth();
  const navigate = useNavigate();

  const [userId, setUserId]       = useState("");
  const [password, setPassword]   = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [stage, setStage]         = useState("password");
  const [error, setError]         = useState("");

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await login(userId, password);
      if (data.requiresTotpSetup) {
        setError("2FA not set up for this account yet. Call POST /api/auth/setup-totp to enroll.");
        return;
      }
      if (data.requiresTotp) { setStage("totp"); return; }
      navigate(ROLE_HOME[data.user.role] || "/");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    }
  }

  async function handleTotpSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await verifyTotp(userId, totpToken);
      navigate(ROLE_HOME[data.user.role] || "/");
    } catch (err) {
      setError(err.response?.data?.error || "Invalid code");
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — ink hero panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-ink-fade relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-signal/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-citrus/10 blur-3xl" />

        <div className="relative flex items-center gap-2">
          <GraduationCap className="text-citrus" size={28} />
          <span className="font-display text-2xl font-bold text-white">
            Acad<span className="text-citrus">Ease</span>
          </span>
        </div>

        <div className="relative">
          <p className="font-display text-4xl font-semibold text-white leading-tight mb-4">
            Know exactly<br />where you stand.
          </p>
          <p className="text-white/60 text-sm max-w-sm leading-relaxed">
            Attendance, results, and certificates — one dashboard, updated the moment
            something changes. No more chasing the notice board.
          </p>
        </div>

        <div className="relative flex items-center gap-6 text-white/40 text-xs font-mono">
          <span>75%+ ATTENDANCE TRACKED LIVE</span>
        </div>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex items-center justify-center px-6 bg-paper">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <GraduationCap className="text-signal" size={26} />
            <span className="font-display text-xl font-bold text-ink">
              Acad<span className="text-signal">Ease</span>
            </span>
          </div>

          <h1 className="font-display text-2xl font-bold text-text-primary mb-1">
            {stage === "password" ? "Welcome back" : "Two-step verification"}
          </h1>
          <p className="text-sm text-text-secondary mb-6">
            {stage === "password"
              ? "Sign in to your account"
              : "Enter the 6-digit code from your authenticator app"}
          </p>

          {error && (
            <div className="mb-4 text-sm text-danger bg-[#FFE7E9] rounded-card px-3 py-2.5">
              {error}
            </div>
          )}

          {stage === "password" ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="label">User ID</label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="STU_2021_CS_001"
                  className="input font-mono"
                  required
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div>
                <label className="label">Authenticator code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value)}
                  placeholder="123456"
                  className="input font-mono tracking-[0.4em] text-center"
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Verifying…" : "Verify"}
              </Button>
              <button
                type="button"
                onClick={() => setStage("password")}
                className="w-full text-sm text-text-muted hover:text-text-secondary text-center"
              >
                ← Back to login
              </button>
            </form>
          )}

          <div className="mt-8 p-3 bg-white border border-border rounded-card">
            <p className="text-xs text-text-muted font-medium mb-1">Demo credentials</p>
            <p className="text-xs font-mono text-text-secondary">
              Password: <span className="text-text-primary">Passw0rd!</span>
            </p>
            <p className="text-xs text-text-muted mt-1">
              Student: STU_2021_CS_001 · Faculty: FAC_CSE_001 · Admin: ADM_CSE_001
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
