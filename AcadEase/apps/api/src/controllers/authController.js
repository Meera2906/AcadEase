import crypto from "crypto";
import bcrypt from "bcryptjs";
import { User } from "../models/index.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { generateTotpSecret, getTotpOtpauthUrl, verifyTotpToken } from "../utils/totp.js";

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes, per PRD 5.1.2

function staffRequires2fa(role) {
  return role === "faculty" || role === "admin" || role === "superadmin";
}

// POST /api/auth/login
export async function login(req, res) {
  const { userId, password } = req.body;
  if (!userId || !password) {
    return res.status(400).json({ error: "userId and password are required" });
  }

  const user = await User.findOne({ userId });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    return res.status(423).json({ error: `Account locked. Try again in ${minutesLeft} minute(s).` });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= LOCK_THRESHOLD) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    return res.status(401).json({ error: "Invalid credentials" });
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;

  // Faculty / Admin / Super Admin require TOTP before a token is issued (PRD 5.1.1)
  if (staffRequires2fa(user.role)) {
    if (!user.totpEnabled) {
      await user.save();
      return res.status(200).json({
        requiresTotpSetup: true,
        userId: user.userId,
        message: "2FA has not been set up yet. Call /api/auth/setup-totp to begin.",
      });
    }
    await user.save();
    return res.status(200).json({
      requiresTotp: true,
      userId: user.userId,
      message: "Password verified. Submit your TOTP code to /api/auth/verify-totp.",
    });
  }

  await user.save();
  return issueTokens(res, user);
}

// POST /api/auth/verify-totp  { userId, token }
export async function verifyTotp(req, res) {
  const { userId, token } = req.body;
  const user = await User.findOne({ userId });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return res.status(400).json({ error: "TOTP is not set up for this account" });
  }

  const ok = verifyTotpToken(token, user.totpSecret);
  if (!ok) return res.status(401).json({ error: "Invalid TOTP code" });

  user.lastLogin = new Date();
  await user.save();
  return issueTokens(res, user);
}

// POST /api/auth/setup-totp  (requires prior password check — simplified: userId + password)
export async function setupTotp(req, res) {
  const { userId, password } = req.body;
  const user = await User.findOne({ userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const secret = generateTotpSecret();
  user.totpSecret = secret; // NOTE: encrypt at rest before production use
  user.totpEnabled = true;
  await user.save();

  const otpauthUrl = getTotpOtpauthUrl(secret, user.email);
  return res.json({ secret, otpauthUrl, message: "Scan this with Google Authenticator, then log in again." });
}

async function issueTokens(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  user.refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  user.lastLogin = new Date();
  await user.save();

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    accessToken,
    user: {
      userId: user.userId,
      role: user.role,
      name: user.name,
      email: user.email,
      departmentId: user.departmentId,
      institutionId: user.institutionId,
    },
  });
}

// POST /api/auth/refresh
export async function refresh(req, res) {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid refresh token" });
  }

  const user = await User.findOne({ userId: payload.userId });
  const expectedHash = crypto.createHash("sha256").update(token).digest("hex");
  if (!user || user.refreshTokenHash !== expectedHash) {
    return res.status(401).json({ error: "Refresh token no longer valid" });
  }

  const accessToken = signAccessToken(user);
  return res.json({ accessToken });
}

// POST /api/auth/logout
export async function logout(req, res) {
  const token = req.cookies?.refreshToken;
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.updateOne({ userId: payload.userId }, { refreshTokenHash: null });
    } catch {
      /* token already invalid — nothing to clean up */
    }
  }
  res.clearCookie("refreshToken");
  return res.json({ message: "Logged out" });
}

// POST /api/auth/forgot-password
export async function forgotPassword(req, res) {
  const { email } = req.body;
  const user = await User.findOne({ email });
  // Always respond 200 to avoid leaking which emails exist.
  if (!user) return res.json({ message: "If that email exists, a reset link has been sent." });

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min, per PRD 5.1.2
  await user.save();

  // TODO: send resetToken via Nodemailer. Logged here for local dev only.
  console.log(`[auth] password reset token for ${email}: ${resetToken}`);

  return res.json({ message: "If that email exists, a reset link has been sent." });
}

// POST /api/auth/reset-password/:token
export async function resetPassword(req, res) {
  const { token } = req.params;
  const { newPassword } = req.body;
  const hashed = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) return res.status(400).json({ error: "Reset token is invalid or expired" });

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  await user.save();

  return res.json({ message: "Password updated. Please log in." });
}
