import { authenticator } from "otplib";

// Faculty, Admin, and Super Admin all require TOTP (Google Authenticator style)
// per PRD Section 5.1.1. Students are exempt in the MVP.
export function generateTotpSecret() {
  return authenticator.generateSecret();
}

export function getTotpOtpauthUrl(secret, email) {
  const issuer = process.env.TOTP_ISSUER || "AcadEase";
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotpToken(token, secret) {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
