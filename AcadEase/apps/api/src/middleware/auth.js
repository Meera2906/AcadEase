import { verifyAccessToken } from "../utils/jwt.js";

export const LEGACY_ROLE_ALIASES = {
  admin: "college_admin",
  superadmin: "tnteu_admin",
};

export function normalizeRole(role) {
  return LEGACY_ROLE_ALIASES[role] || role;
}

export function isCollegeScopedRole(role) {
  const normalized = normalizeRole(role);
  return ["student", "faculty", "college_admin", "college_coordinator", "tnteu_admin"].includes(normalized);
}

export function buildCollegeScope(user = {}) {
  const role = normalizeRole(user.role);
  if (role === "tnteu_admin") {
    return {};
  }
  if (user.collegeId) {
    return { collegeId: user.collegeId };
  }
  if (user.institutionId) {
    return { collegeId: user.institutionId };
  }
  return {};
}

export function applyCollegeScope(filter = {}, req = {}, options = {}) {
  const base = { ...filter };
  const scope = buildCollegeScope(req.user || {});
  const allowGlobal = Boolean(options.allowGlobal);

  if (scope.collegeId && !allowGlobal) {
    base.collegeId = scope.collegeId;
  }

  if (options.overrideCollegeId) {
    base.collegeId = options.overrideCollegeId;
  }

  return base;
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  try {
    const payload = verifyAccessToken(token);

    // A pre-admission applicant token is not a staff or student credential.
    // Refuse it here so no route can accidentally accept one by omission.
    if (payload.typ === "applicant") {
      return res.status(403).json({
        error: "Applicant accounts can only access the admission portal",
      });
    }

    req.user = {
      ...payload,
      role: normalizeRole(payload.role),
      collegeId: payload.collegeId || payload.institutionId || null,
    };
    req.collegeFilter = buildCollegeScope(req.user);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired access token" });
  }
}

// The mirror of requireAuth: only pre-admission applicant tokens pass, and the
// applicant record is loaded so every handler is automatically scoped to the
// one applicant that token belongs to.
export function requireApplicantAuth(loadApplicant) {
  return async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing access token" });

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid or expired access token" });
    }

    if (payload.typ !== "applicant") {
      return res.status(403).json({ error: "This endpoint is for admission applicants only" });
    }

    try {
      const applicant = await loadApplicant(payload.applicantId);
      if (!applicant) return res.status(401).json({ error: "Applicant account no longer exists" });
      if (applicant.studentUserId) {
        return res.status(403).json({
          error: "This application has been enrolled — sign in with your student account instead",
        });
      }
      req.applicant = applicant;
      req.applicantToken = payload;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const normalized = normalizeRole(req.user.role);
    const allowed = roles.map(normalizeRole);
    if (!allowed.includes(normalized)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
    }
    next();
  };
}
