import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

// Institutional key pairs, one per principal:
//   "tnteu"        — the super admin / university itself
//   "<collegeId>"  — each affiliated college
//
// Used for two different jobs:
//   * sealing admission documents (documentCrypto.js — RSA-OAEP key wrapping)
//   * counter-signing approvals   (approvalChain.js  — RSA-PSS signatures)
//
// Private keys are PKCS#8, encrypted at rest under DOC_KEY_PASSPHRASE.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TNTEU_KEY_ID = "tnteu";

function keyDir() {
  // Read lazily so tests can point DOC_KEY_DIR at a temp directory.
  return process.env.DOC_KEY_DIR
    ? path.resolve(process.env.DOC_KEY_DIR)
    : path.resolve(__dirname, "../../secure-storage/keys");
}

function passphrase() {
  const secret = process.env.DOC_KEY_PASSPHRASE;
  if (!secret) {
    throw new Error(
      "DOC_KEY_PASSPHRASE is not set — institutional keys cannot be created, read or used without it"
    );
  }
  return secret;
}

function safeKeyId(keyId) {
  return String(keyId).replace(/[^A-Za-z0-9_-]/g, "_");
}

function keyPaths(keyId) {
  const safe = safeKeyId(keyId);
  const dir = keyDir();
  return {
    publicPath: path.join(dir, `${safe}.pub.pem`),
    privatePath: path.join(dir, `${safe}.key.pem`),
  };
}

// ---------------------------------------------------------------------------
// Keys from the environment.
//
// On a host with an ephemeral filesystem (Render's free tier, most container
// platforms) anything written to secure-storage/keys is gone at the next
// deploy. A fresh key pair would then be generated on demand — and every
// certificate ever signed under the old key would start reporting itself as
// forged to anyone who scanned it. That is a silent, unrecoverable failure.
//
// So a key pair may instead be supplied as base64-encoded PEM in the
// environment, which survives redeploys:
//
//   KEY_TNTEU_PRIVATE / KEY_TNTEU_PUBLIC
//   KEY_TNTEU_COL_0417_PRIVATE / KEY_TNTEU_COL_0417_PUBLIC
//
// Generate them with:  node scripts/export-keys.mjs
// ---------------------------------------------------------------------------
function envKey(keyId, half) {
  const raw = process.env[`KEY_${safeKeyId(keyId).toUpperCase()}_${half}`];
  if (!raw) return null;
  const text = raw.trim();
  // Accept both raw PEM (multi-line) and base64-wrapped PEM, because dashboards
  // differ in how kindly they treat newlines in a value.
  if (text.includes("-----BEGIN")) return text.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(text, "base64").toString("utf8");
    return decoded.includes("-----BEGIN") ? decoded : null;
  } catch {
    return null;
  }
}

// Generated on first use, so onboarding a college needs no key ceremony.
export function ensureKeyPair(keyId) {
  const dir = keyDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const { publicPath, privatePath } = keyPaths(keyId);

  const hasPublic = fs.existsSync(publicPath);
  const hasPrivate = fs.existsSync(privatePath);

  if (hasPublic && hasPrivate) return { publicPath, privatePath };

  // Half a key pair means the keyring is damaged, not that a new institution
  // is being onboarded. Silently generating a replacement would rotate the key
  // out from under every signature ever produced with it — every historical
  // certificate would start reporting itself as forged. Fail loudly instead.
  if (hasPublic || hasPrivate) {
    throw new Error(
      `Keyring for "${keyId}" is incomplete (${hasPublic ? "private" : "public"} key missing). ` +
        "Restore it from backup — generating a new pair would invalidate every signature already issued under this key."
    );
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
      cipher: "aes-256-cbc",
      passphrase: passphrase(),
    },
  });

  fs.writeFileSync(publicPath, publicKey, { mode: 0o600 });
  fs.writeFileSync(privatePath, privateKey, { mode: 0o600 });
  return { publicPath, privatePath };
}

// Verification needs the public half only — and deliberately does not need the
// passphrase. Anyone can check a signature; only the key holder can make one.
export function loadPublicKey(keyId) {
  const fromEnv = envKey(keyId, "PUBLIC");
  if (fromEnv) return crypto.createPublicKey(fromEnv);

  const { publicPath } = keyPaths(keyId);
  if (fs.existsSync(publicPath)) {
    return crypto.createPublicKey(fs.readFileSync(publicPath, "utf8"));
  }
  return crypto.createPublicKey(fs.readFileSync(ensureKeyPair(keyId).publicPath, "utf8"));
}

export function loadPrivateKey(keyId) {
  const fromEnv = envKey(keyId, "PRIVATE");
  if (fromEnv) {
    return crypto.createPrivateKey({ key: fromEnv, passphrase: passphrase() });
  }

  const { privatePath } = ensureKeyPair(keyId);
  return crypto.createPrivateKey({
    key: fs.readFileSync(privatePath, "utf8"),
    passphrase: passphrase(),
  });
}

// True when this key is pinned in the environment and therefore survives a
// redeploy. Surfaced by /health so a deployment can be checked at a glance.
export function keyIsPinned(keyId) {
  return Boolean(envKey(keyId, "PRIVATE") && envKey(keyId, "PUBLIC"));
}

// A stable fingerprint of the public key, printed on certificates so a holder
// can tell which key signed their document without exposing the key itself.
export function keyFingerprint(keyId) {
  const der = loadPublicKey(keyId).export({ type: "spki", format: "der" });
  return crypto.createHash("sha256").update(der).digest("hex").slice(0, 32);
}

export function publicKeyPem(keyId) {
  return loadPublicKey(keyId).export({ type: "spki", format: "pem" }).toString();
}
