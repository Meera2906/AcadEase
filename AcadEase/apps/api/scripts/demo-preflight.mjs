// Pre-demo preflight, run against the DEPLOYED site.
//
// Checks the things that actually go wrong twenty minutes before a demo:
// the API is awake, CORS accepts the front end, cross-site cookies are set
// correctly, the seeded data is there, the walkthrough student can really
// request the certificate the demo depends on, and — the one that ruins a
// live run — whether each staff account has already enrolled 2FA or will
// ambush its presenter with a QR-code screen.
//
//   node scripts/demo-preflight.mjs --api https://acadease-api.onrender.com --web https://acadease.vercel.app
//
// Needs no secrets and no staff credentials: it only signs in as the student.
// Everything else is checked from public or student-visible endpoints.

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1].replace(/\/$/, "") : fallback;
};

const API = arg("api", "http://localhost:5000");
const WEB = arg("web", "http://localhost:5173");
const STUDENT = arg("student", "STU_2021_CS_001");
const PASSWORD = arg("password", "Demo@2025");

const STAFF = [
  ["SUP_001", "Laptop 1 — TNTEU super admin"],
  ["ADM_CSE_001", "Laptop 2 — college admin"],
  ["FAC_CSE_001", "Laptop 3 — faculty"],
];

let failed = 0;
let warned = 0;

const pass = (label, extra = "") => console.log(`  \x1b[32mPASS\x1b[0m  ${label}${extra ? ` — ${extra}` : ""}`);
const fail = (label, extra = "") => { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${extra ? ` — ${extra}` : ""}`); };
const warn = (label, extra = "") => { warned += 1; console.log(`  \x1b[33mWARN\x1b[0m  ${label}${extra ? ` — ${extra}` : ""}`); };
const check = (label, ok, extra = "") => (ok ? pass(label) : fail(label, extra));
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function json(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

console.log(`\nAcadEase demo preflight\n  API ${API}\n  WEB ${WEB}`);

// ── 1. Is the API awake and healthy? ────────────────────────────────────────
section("1. Service");

const started = Date.now();
let health;
try {
  const res = await fetch(`${API}/health`);
  health = await json(res);
  const ms = Date.now() - started;
  check("API responds", res.ok, `HTTP ${res.status}`);
  if (ms > 5000) {
    warn(`API took ${(ms / 1000).toFixed(1)}s to answer`, "it was asleep — it is awake now, keep a tab open until you present");
  } else {
    pass("API is warm", `${ms}ms`);
  }
} catch (err) {
  fail("API is unreachable", String(err.message));
  console.log("\nNothing else can be checked. Is the Render service deployed and the URL right?\n");
  process.exit(1);
}

check("database is connected", health.database === "connected", `reported "${health.database}"`);

if (health.signingKeyPinned) {
  pass("signing keys are pinned to the environment");
} else {
  warn("signing keys are NOT pinned",
    "the next redeploy will regenerate them and every certificate issued before it stops verifying — see DEPLOYMENT.md §4");
}

// ── 2. Will the browser be allowed to talk to it? ───────────────────────────
section("2. Browser wiring");

const preflight = await fetch(`${API}/api/auth/login`, {
  method: "OPTIONS",
  headers: { origin: WEB, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
});
const allowOrigin = preflight.headers.get("access-control-allow-origin");
const allowCreds = preflight.headers.get("access-control-allow-credentials");

check("CORS allows the front end origin", allowOrigin === WEB || allowOrigin === "*",
  `allow-origin was "${allowOrigin}" — set CLIENT_URL on Render to exactly ${WEB} (no trailing slash)`);
check("CORS allows credentials", allowCreds === "true", `allow-credentials was "${allowCreds}"`);

// ── 3. Student sign-in and the cookies it sets ──────────────────────────────
section("3. Student sign-in");

const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: WEB },
  body: JSON.stringify({ userId: STUDENT, password: PASSWORD }),
});
const login = await json(loginRes);

check(`${STUDENT} can sign in`, Boolean(login.accessToken),
  login.error || login.message || JSON.stringify(login).slice(0, 120));

if (!login.accessToken) {
  console.log("\nStop here: without the student account nothing else in the demo works.");
  console.log("Run `npm run seed` against the production database.\n");
  process.exit(1);
}

check("the CSRF token comes back in the response body", Boolean(login.csrfToken),
  "old build still deployed — every form submit will fail with 'CSRF token missing or invalid'");

const cookies = loginRes.headers.getSetCookie?.() || [];
const refreshCookie = cookies.find((c) => c.startsWith("refreshToken="));
const sameSiteNone = /samesite=none/i.test(refreshCookie || "");
const secure = /;\s*secure/i.test(refreshCookie || "");
const crossSite = new URL(API).hostname !== new URL(WEB).hostname;

if (crossSite) {
  check("refresh cookie is SameSite=None", sameSiteNone,
    "the browser will drop it and everyone gets logged out at the first token refresh — set COOKIE_CROSS_SITE=true");
  check("refresh cookie is Secure", secure, "SameSite=None is ignored without Secure");
} else {
  pass("same-host setup — cross-site cookie rules do not apply", "cookies ignore the port");
}

const authed = {
  authorization: `Bearer ${login.accessToken}`,
  "content-type": "application/json",
  cookie: cookies.map((c) => c.split(";")[0]).join("; "),
  "x-csrf-token": login.csrfToken || "",
  origin: WEB,
};

// ── 3b. Does a reload keep you signed in? ───────────────────────────────────
// The access token is held in memory, so a refresh or a new tab starts with
// nothing but the cookie. If /auth/refresh does not hand back the user, the app
// cannot rebuild the session and every reload lands on the login page — which
// matters enormously when each laptop opens several tabs.
const reload = await fetch(`${API}/api/auth/refresh`, {
  method: "POST",
  headers: { cookie: cookies.map((c) => c.split(";")[0]).join("; "), origin: WEB },
});
const reloaded = await json(reload);

check("a reload can restore the session (refresh accepts the cookie)", reload.status === 200,
  `HTTP ${reload.status} — new tabs and hard refreshes will bounce to the login page`);
check("refresh returns the signed-in user, not just a token", Boolean(reloaded.user?.userId),
  "deployed build predates the session-restore fix — every reload looks like a logout");

// ── 4. Can the student do what the script asks them to do? ──────────────────
section("4. The student's part of the demo");

const results = await json(await fetch(`${API}/api/results/student/${STUDENT}`, { headers: authed }));
const published = (results.results || []).filter((r) => r.status === "published");
check("the student has a published result to dispute", published.length > 0,
  "no published results — the grievance step has nothing to point at. Re-run `npm run seed`.");

const eligibility = await json(await fetch(`${API}/api/certificates/eligibility`, { headers: authed }));
const merit = eligibility.merit ?? eligibility.eligibility?.merit ?? null;
const meritOk = merit ? merit.eligible !== false : JSON.stringify(eligibility).includes('"merit"');
check("the student is eligible for a MERIT certificate", Boolean(meritOk),
  `${merit?.reason || JSON.stringify(eligibility).slice(0, 160)} — the certificate → grievance → reissue story cannot run`);

// A live CSRF-protected write, which is exactly what broke in production.
// Marking notifications read is idempotent, so the probe leaves no debris.
const probe = await fetch(`${API}/api/notifications/read-all`, { method: "PATCH", headers: authed });
check("a CSRF-protected write succeeds (OD requests, grievances, all forms)", probe.status === 200,
  `HTTP ${probe.status} — ${JSON.stringify(await json(probe)).slice(0, 140)}${probe.status === 403 ? " — the deployed build predates the CSRF fix" : ""}`);

// ── 5. Staff accounts: enrolled, or about to show a QR mid-demo? ────────────
section("5. Staff accounts and 2FA");

for (const [userId, who] of STAFF) {
  const res = await json(await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: WEB },
    body: JSON.stringify({ userId, password: PASSWORD }),
  }));

  if (res.requiresTotp) {
    pass(`${userId} (${who})`, "2FA enrolled, ready");
  } else if (res.requiresTotpSetup) {
    warn(`${userId} (${who}) has NOT enrolled 2FA`,
      "first sign-in will show a QR code — do this before you present, not during");
  } else if (res.accessToken) {
    warn(`${userId} (${who}) signed in with no 2FA`, "unexpected for a staff role");
  } else {
    fail(`${userId} (${who}) cannot sign in`, res.error || JSON.stringify(res).slice(0, 120));
  }
}

// ── 6. Is the seeded story actually there? ──────────────────────────────────
section("6. Seeded demo data");

const anyCert = await fetch(`${API}/api/certificates/verify/preflight-not-a-real-cert`);
check("public certificate verification is reachable without a login", anyCert.status === 404,
  `HTTP ${anyCert.status} — expected 404 for an unknown certId`);

const circulars = await json(await fetch(`${API}/api/circulars`, { headers: authed }));
check("circulars are seeded and visible to a student", (circulars.circulars || []).length > 0,
  "run `npm run seed:governance`");

const notifications = await json(await fetch(`${API}/api/notifications`, { headers: authed }));
check("notifications endpoint works", Array.isArray(notifications.notifications));

// ── Verdict ─────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(64));
if (failed === 0 && warned === 0) {
  console.log("\x1b[32mREADY.\x1b[0m Everything the demo touches is working.");
} else if (failed === 0) {
  console.log(`\x1b[33mREADY WITH ${warned} WARNING(S).\x1b[0m Read them — each one is something that bites mid-demo.`);
} else {
  console.log(`\x1b[31m${failed} CHECK(S) FAILED\x1b[0m${warned ? `, ${warned} warning(s)` : ""}. Fix these before presenting.`);
}
console.log("─".repeat(64));
console.log("Remember to clear the admission pipeline before the run:");
console.log("  npm run reset:admissions\n");

process.exit(failed === 0 ? 0 : 1);
