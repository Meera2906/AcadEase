import jwt from "jsonwebtoken";

function accessExpiryForRole(role) {
  switch (role) {
    case "student":
      return process.env.JWT_ACCESS_EXPIRES_STUDENT || "24h";
    case "faculty":
    case "admin":
      return process.env.JWT_ACCESS_EXPIRES_STAFF || "8h";
    case "superadmin":
      return process.env.JWT_ACCESS_EXPIRES_SUPERADMIN || "4h";
    default:
      return "1h";
  }
}

// Access token payload mirrors PRD Section 5.1.3 exactly.
export function signAccessToken(user) {
  const payload = {
    userId: user.userId,
    role: user.role,
    departmentId: user.departmentId,
    institutionId: user.institutionId,
  };
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: accessExpiryForRole(user.role),
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
