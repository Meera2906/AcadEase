import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, ShieldCheck, ScanLine, KeyRound, Copy, Check, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import Button from "../components/ui/Button.jsx";

const ROLE_HOME = {
  student:    "/student/dashboard",
  faculty:    "/faculty/attendance",
  admin:      "/admin/dashboard",
  superadmin: "/admin/dashboard",
};

// ── QR code via free public API (no package needed) ─────────────────────────
function QrCode({ value, size = 200 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=14162B&margin=8`;
  return (
    <img
      src={url}
      alt="TOTP QR code"
      width={size}
      height={size}
      className="rounded-xl border border-border shadow-card mx-auto"
    />
  );
}

// ── Copy-to-clipboard button ─────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1 text-xs text-signal hover:text-signal-dark transition-colors"
    >
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── Step indicator ───────────────────────────────────────────────────────────
function StepDot({ active, done, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
        done  ? "bg-success text-white" :
        active ? "bg-signal text-white" :
                 "bg-border text-text-muted"
      }`}>
        {done ? <Check size={13} /> : label}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Login() {
  const { login, initTotpSetup, verifyTotp, loading } = useAuth();
  const navigate = useNavigate();

  // stage: "password" | "setup" | "totp"
  const [stage, setStage]           = useState("password");
  const [userId, setUserId]         = useState("");
  const [password, setPassword]     = useState("");
  const [totpToken, setTotpToken]   = useState("");
  const [confirmCode, setConfirmCode] = useState(""); // used in setup stage to verify scan worked
  const [setupData, setSetupData]   = useState(null); // { secret, otpauthUrl }
  const [error, setError]           = useState("");

  // ── Stage 1: password ──────────────────────────────────────────────────────
  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await login(userId, password);
      if (data.requiresTotpSetup) {
        // First-time 2FA — fetch QR code
        const setup = await initTotpSetup(userId, password);
        setSetupData(setup);
        setStage("setup");
        return;
      }
      if (data.requiresTotp) {
        setStage("totp");
        return;
      }
      navigate(ROLE_HOME[data.user.role] || "/");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    }
  }

  // ── Stage 2: setup — confirm the scan worked with first code ──────────────
  async function handleSetupConfirm(e) {
    e.preventDefault();
    setError("");
    try {
      // Verify the code they entered against the newly set secret
      const data = await verifyTotp(userId, confirmCode);
      navigate(ROLE_HOME[data.user.role] || "/");
    } catch (err) {
      setError("Code didn't match — make sure you scanned the QR correctly and try again.");
    }
  }

  // ── Stage 3: totp ──────────────────────────────────────────────────────────
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

  const stageIndex = stage === "password" ? 0 : stage === "setup" ? 1 : 2;

  return (
    <div className="min-h-screen flex">
      {/* ── Left hero panel ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-ink-fade relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-signal/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-citrus/10 blur-3xl" />

        <div className="relative flex items-center gap-2">
          <GraduationCap className="text-citrus" size={28} />
          <span className="font-display text-2xl font-bold text-white">
            Acad<span className="text-citrus">Ease</span>
          </span>
        </div>

        <div className="relative space-y-6">
          <p className="font-display text-4xl font-semibold text-white leading-tight">
            Know exactly<br />where you stand.
          </p>
          <p className="text-white/60 text-sm max-w-sm leading-relaxed">
            Attendance, results, and certificates — one dashboard, updated the moment
            something changes. No more chasing the notice board.
          </p>

          {/* 2FA callout on hero */}
          <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-4 max-w-sm">
            <ShieldCheck size={20} className="text-citrus shrink-0 mt-0.5" />
            <div>
              <p className="text-white text-sm font-semibold">Two-factor authentication</p>
              <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
                Faculty and admin accounts are protected with TOTP 2FA via Google Authenticator or any compatible app.
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-6 text-white/40 text-xs font-mono">
          <span>75%+ ATTENDANCE TRACKED LIVE</span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 bg-paper">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <GraduationCap className="text-signal" size={26} />
            <span className="font-display text-xl font-bold text-ink">
              Acad<span className="text-signal">Ease</span>
            </span>
          </div>

          {/* Step indicator — only shown for 2FA stages */}
          {stage !== "password" && (
            <div className="flex items-center gap-2 mb-6">
              <StepDot active={stageIndex === 0} done={stageIndex > 0} label="1" />
              <div className={`flex-1 h-px transition-colors ${stageIndex > 0 ? "bg-success" : "bg-border"}`} />
              <StepDot active={stageIndex === 1} done={stageIndex > 1} label="2" />
              <div className={`flex-1 h-px transition-colors ${stageIndex > 1 ? "bg-success" : "bg-border"}`} />
              <StepDot active={stageIndex === 2} done={false} label="3" />
            </div>
          )}

          {/* ── Stage headings ── */}
          {stage === "password" && (
            <>
              <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Welcome back</h1>
              <p className="text-sm text-text-secondary mb-6">Sign in to your account</p>
            </>
          )}
          {stage === "setup" && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <ScanLine size={20} className="text-signal" />
                <h1 className="font-display text-xl font-bold text-text-primary">Set up two-factor auth</h1>
              </div>
              <p className="text-sm text-text-secondary mb-6">
                Scan the QR code with Google Authenticator, Authy, or any TOTP app.
              </p>
            </>
          )}
          {stage === "totp" && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={20} className="text-signal" />
                <h1 className="font-display text-xl font-bold text-text-primary">Two-step verification</h1>
              </div>
              <p className="text-sm text-text-secondary mb-6">
                Enter the 6-digit code from your authenticator app.
              </p>
            </>
          )}

          {/* ── Error banner ── */}
          {error && (
            <div className="mb-4 text-sm text-danger bg-[#FFE7E9] border border-danger/20 rounded-card px-3 py-2.5">
              {error}
            </div>
          )}

          {/* ── Stage 1: Password form ── */}
          {stage === "password" && (
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

              <div className="mt-6 p-3 bg-white border border-border rounded-card">
                <p className="text-xs text-text-muted font-medium mb-1">Demo credentials</p>
                <p className="text-xs font-mono text-text-secondary">
                  Password: <span className="text-text-primary">Passw0rd!</span>
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Student: STU_2021_CS_001 · Faculty: FAC_CSE_001 · Admin: ADM_CSE_001
                </p>
              </div>
            </form>
          )}

          {/* ── Stage 2: TOTP setup ── */}
          {stage === "setup" && setupData && (
            <form onSubmit={handleSetupConfirm} className="space-y-5">
              {/* QR code */}
              <div className="bg-white border border-border rounded-card p-4 space-y-3">
                <QrCode value={setupData.otpauthUrl} size={180} />
                <p className="text-xs text-text-muted text-center">
                  Can't scan? Enter this key manually:
                </p>
                <div className="flex items-center justify-between gap-2 bg-paper border border-border rounded-xl px-3 py-2">
                  <code className="text-xs font-mono text-text-primary tracking-wider break-all">
                    {setupData.secret}
                  </code>
                  <CopyButton text={setupData.secret} />
                </div>
              </div>

              {/* Instructions */}
              <ol className="space-y-1.5 text-xs text-text-secondary list-none">
                {[
                  "Open Google Authenticator (or Authy, 1Password, etc.)",
                  "Tap + → Scan a QR code",
                  "Point your camera at the code above",
                  "Enter the 6-digit code shown below to confirm",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-signal/10 text-signal text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>

              {/* Confirm code */}
              <div>
                <label className="label">Confirm with your first code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="input font-mono tracking-[0.4em] text-center"
                  required
                />
              </div>

              <Button type="submit" disabled={loading || confirmCode.length < 6} className="w-full">
                {loading ? "Verifying…" : "Confirm & sign in"}
              </Button>

              <button
                type="button"
                onClick={() => { setStage("password"); setError(""); setSetupData(null); }}
                className="w-full text-sm text-text-muted hover:text-text-secondary text-center flex items-center justify-center gap-1"
              >
                <ArrowLeft size={13} /> Back to login
              </button>
            </form>
          )}

          {/* ── Stage 3: TOTP entry (returning user) ── */}
          {stage === "totp" && (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              {/* Visual indicator */}
              <div className="flex items-center gap-3 bg-signal/5 border border-signal/20 rounded-card px-4 py-3">
                <ShieldCheck size={18} className="text-signal shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">Authenticator required</p>
                  <p className="text-xs text-text-muted">Signed in as <span className="font-mono">{userId}</span></p>
                </div>
              </div>

              <div>
                <label className="label">6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="input font-mono tracking-[0.4em] text-center text-xl"
                  autoFocus
                  required
                />
                <p className="text-xs text-text-muted mt-1.5">
                  Open your authenticator app and enter the current code for AcadEase.
                </p>
              </div>

              <Button type="submit" disabled={loading || totpToken.length < 6} className="w-full">
                {loading ? "Verifying…" : "Verify & sign in"}
              </Button>

              <button
                type="button"
                onClick={() => { setStage("password"); setTotpToken(""); setError(""); }}
                className="w-full text-sm text-text-muted hover:text-text-secondary text-center flex items-center justify-center gap-1"
              >
                <ArrowLeft size={13} /> Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
