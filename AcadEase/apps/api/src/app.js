import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "./middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import authRoutes from "./routes/authRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import assessmentRoutes from "./routes/assessmentRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import grievanceRoutes from "./routes/grievanceRoutes.js";
import admissionRoutes from "./routes/admissionRoutes.js";
import applicantRoutes from "./routes/applicantRoutes.js";
import universityRequestRoutes from "./routes/universityRequestRoutes.js";
import miscRoutes from "./routes/miscRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.disable("x-powered-by");
// Render (and every other PaaS) terminates TLS at a proxy. Without this Express
// sees plain HTTP, refuses to set Secure cookies, and the rate limiter buckets
// every request under the proxy's single IP.
app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": ["'self'", process.env.CLIENT_URL || "http://localhost:5173"],
    },
  },
}));
// One deployment usually has more than one legitimate front-end origin: the
// production domain, Vercel's per-branch preview URLs, and localhost while
// somebody is debugging against the deployed API. CLIENT_URL takes a
// comma-separated list; ALLOW_VERCEL_PREVIEWS opens up *.vercel.app.
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === "true";

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, server-to-server, same-origin navigations
  const clean = origin.replace(/\/$/, "");
  if (allowedOrigins.includes(clean)) return true;
  if (allowVercelPreviews && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(clean)) return true;
  return false;
}

app.use(
  cors({
    origin: (origin, callback) =>
      isAllowedOrigin(origin)
        ? callback(null, true)
        : callback(new Error(`Origin ${origin} is not allowed by CORS`)),
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
const csrfExemptPaths = new Set([
  // Session bootstrap endpoints: no session exists yet, so there is no CSRF
  // cookie to double-submit. Each one issues the token on success.
  "/api/applicant/register",
  "/api/applicant/login",
  "/api/applicant/refresh",
  "/api/applicant/logout",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/verify-totp",
  "/api/auth/setup-totp",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
]);

app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (csrfExemptPaths.has(req.path) || req.path.startsWith("/api/auth/reset-password/")) {
    return next();
  }

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF token missing or invalid" });
  }
  return next();
});
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Basic brute-force guard on auth endpoints (PRD 5.1.2 lockout policy is the
// per-account version of this; this is the per-IP network-level version).
//
// `skipSuccessfulRequests` is what makes this usable in a room. Several people
// demonstrating different roles from the same venue WiFi share one public IP,
// and every silent token refresh also lands on /api/auth — counting those, a
// handful of laptops could exhaust a 50-request budget and lock the whole room
// out mid-presentation. Only *failed* attempts count now, which is what a
// brute-force guard is actually for, and per-account lockout after 5 failures
// (authController) remains the real protection.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 100,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many failed attempts from this network. Try again in a few minutes." },
});
app.use("/api/auth", authLimiter);

// Render pings this to keep the service marked healthy. It also answers the
// two questions that actually go wrong on a fresh deploy: is the database
// reachable, and are the signing keys pinned to the environment (rather than
// living on a disk that the next deploy will wipe)?
app.get("/health", async (req, res) => {
  const { default: mongoose } = await import("mongoose");
  const { keyIsPinned, TNTEU_KEY_ID } = await import("./utils/keyring.js");

  const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];
  const signingKeyPinned = (() => {
    try { return keyIsPinned(TNTEU_KEY_ID); } catch { return false; }
  })();

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: dbStates[mongoose.connection.readyState] || "unknown",
    signingKeyPinned,
    allowedOrigins,
    warning: signingKeyPinned
      ? undefined
      : "Signing keys are on the local filesystem. On an ephemeral host they will be regenerated on the next deploy and every certificate already issued will fail verification. See scripts/export-keys.mjs.",
  });
});

// Sensitive files are no longer exposed anonymously. Authenticated users can still access them
// via the secure file endpoint within the API, and direct /storage access is limited to logged-in users.
app.use("/storage", requireAuth, express.static(path.join(__dirname, "../storage")));

app.use("/api/auth", authRoutes);
// Mounted ahead of the "/api" catch-all routers below: those call requireAuth
// at the top of the router, which would 401 the applicant portal's public
// register/login endpoints before they were ever reached.
app.use("/api/applicant", applicantRoutes);
// Also ahead of the catch-all: /api/certificates/verify/:certId is the public
// QR-scan endpoint. Mounted after assessmentRoutes it was being intercepted by
// that router's requireAuth, so anyone without a login got "Missing access
// token" — which defeats the entire point of a publicly verifiable certificate.
app.use("/api/certificates", certificateRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api", assessmentRoutes); // exposes /api/assessments/*, /api/marks/*, /api/results/*
app.use("/api/grievances", grievanceRoutes);
app.use("/api/admissions", admissionRoutes);
app.use("/api/university-requests", universityRequestRoutes);
app.use("/api", miscRoutes); // exposes /api/notifications/*, /api/users/*, /api/admin/*, /api/gamification/*

app.use(notFound);
app.use(errorHandler);

export default app;
