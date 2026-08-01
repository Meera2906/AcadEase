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

function keyPaths(keyId) {
  const safe = String(keyId).replace(/[^A-Za-z0-9_-]/g, "_");
  const dir = keyDir();
  return {
    publicPath: path.join(dir, `${safe}.pub.pem`),
    privatePath: path.join(dir, `${safe}.key.pem`),
  };
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
  const { publicPath } = keyPaths(keyId);
  if (fs.existsSync(publicPath)) {
    return crypto.createPublicKey(fs.readFileSync(publicPath, "utf8"));
  }
  return crypto.createPublicKey(fs.readFileSync(ensureKeyPair(keyId).publicPath, "utf8"));
}

export function loadPrivateKey(keyId) {
  const { privatePath } = ensureKeyPair(keyId);
  return crypto.createPrivateKey({
    key: fs.readFileSync(privatePath, "utf8"),
    passphrase: passphrase(),
  });
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
