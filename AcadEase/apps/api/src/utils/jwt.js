import jwt from "jsonwebtoken";

function accessExpiryForRole(role) {
  switch (role) {
    case "student":
      return process.env.JWT_ACCESS_EXPIRES_STUDENT || "24h";
    case "faculty":
    case "college_admin":
    case "college_coordinator":
    case "admin":
      return process.env.JWT_ACCESS_EXPIRES_STAFF || "8h";
    case "tnteu_admin":
    case "superadmin":
      return process.env.JWT_ACCESS_EXPIRES_SUPERADMIN || "4h";
    default:
      return "1h";
  }
}

// Access token payload mirrors PRD Section 5.1.3 exactly.
export function signAccessToken(user) {
  const role = user.role === "admin" ? "college_admin" : user.role === "superadmin" ? "tnteu_admin" : user.role;
  const payload = {
    userId: user.userId,
    role,
    departmentId: user.departmentId || null,
    collegeId: user.collegeId || user.institutionId || null,
    institutionId: user.institutionId || user.collegeId || null,
  };
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: accessExpiryForRole(user.role),
  });
}

// Pre-admission applicants are not Users and must never be able to reach a
// staff or student route. Their tokens carry `typ: "applicant"`, which
// requireAuth rejects outright — the separation is in the token itself, not in
// a role string that some future route might forget to check.
export function signApplicantToken(applicant) {
  return jwt.sign(
    {
      typ: "applicant",
      applicantId: applicant.applicantId,
      userId: applicant.applicantId,
      role: "applicant",
      collegeId: applicant.collegeId,
      program: applicant.program,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_APPLICANT || "2h" }
  );
}

export function signApplicantRefreshToken(applicant) {
  return jwt.sign({ typ: "applicant_refresh", applicantId: applicant.applicantId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || "7d",
  });
}

export function signRefreshToken(user) {
  return jwt.sign({ userId: user.userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || "7d",
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}
