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
import miscRoutes from "./routes/miscRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": ["'self'", process.env.CLIENT_URL || "http://localhost:5173"],
    },
  },
}));
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
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
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use("/api/auth", authLimiter);

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Sensitive files are no longer exposed anonymously. Authenticated users can still access them
// via the secure file endpoint within the API, and direct /storage access is limited to logged-in users.
app.use("/storage", requireAuth, express.static(path.join(__dirname, "../storage")));

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api", assessmentRoutes); // exposes /api/assessments/*, /api/marks/*, /api/results/*
app.use("/api/certificates", certificateRoutes);
app.use("/api/grievances", grievanceRoutes);
app.use("/api", miscRoutes); // exposes /api/notifications/*, /api/users/*, /api/admin/*, /api/gamification/*

app.use(notFound);
app.use(errorHandler);

export default app;
