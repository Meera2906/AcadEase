import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Envelope encryption for admission proofs.
//
// Applicants upload identity documents — marksheets carry names, dates of
// birth, register numbers, and ID proofs carry Aadhaar numbers. Those sit at
// rest on a server that university staff, faculty and students all log in to.
// So the plaintext never touches the disk:
//
//   1. Each file gets a fresh random AES-256-GCM data key (DEK).
//   2. The file is encrypted with that DEK. Only the ciphertext is written.
//   3. The DEK is wrapped (RSA-OAEP) once for TNTEU and once for the university
//      that owns the applicant. Those wrapped copies live on the document row.
//   4. Decryption requires one of those two private keys. A student, a faculty
//      account, an applicant, or a different university has no wrapped copy —
//      there is no key path for them, not merely a missing permission check.
//
// Private keys are PKCS#8, encrypted at rest with DOC_KEY_PASSPHRASE.
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_DIR = path.resolve(__dirname, "../../secure-storage/keys");

export const TNTEU_KEY_ID = "tnteu";

function passphrase() {
  const secret = process.env.DOC_KEY_PASSPHRASE;
  if (!secret) {
    throw new Error(
      "DOC_KEY_PASSPHRASE is not set — admission documents cannot be encrypted or read without it"
    );
  }
  return secret;
}

function keyPaths(keyId) {
  const safe = String(keyId).replace(/[^A-Za-z0-9_-]/g, "_");
  return {
    publicPath: path.join(KEY_DIR, `${safe}.pub.pem`),
    privatePath: path.join(KEY_DIR, `${safe}.key.pem`),
  };
}

// Key pairs are created on first use, so adding a university needs no
// out-of-band ceremony.
export function ensureKeyPair(keyId) {
  if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  const { publicPath, privatePath } = keyPaths(keyId);

  if (fs.existsSync(publicPath) && fs.existsSync(privatePath)) {
    return { publicPath, privatePath };
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

function loadPublicKey(keyId) {
  const { publicPath } = ensureKeyPair(keyId);
  return crypto.createPublicKey(fs.readFileSync(publicPath, "utf8"));
}

function loadPrivateKey(keyId) {
  const { privatePath } = ensureKeyPair(keyId);
  return crypto.createPrivateKey({
    key: fs.readFileSync(privatePath, "utf8"),
    passphrase: passphrase(),
  });
}

function wrap(keyId, dek) {
  return crypto
    .publicEncrypt(
      { key: loadPublicKey(keyId), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      dek
    )
    .toString("base64");
}

function unwrap(keyId, wrapped) {
  return crypto.privateDecrypt(
    { key: loadPrivateKey(keyId), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(wrapped, "base64")
  );
}

/**
 * @returns {{ ciphertext: Buffer, encryption: object }} — `encryption` is stored
 *          on the DocumentSubmission row alongside the ciphertext file.
 */
export function encryptDocument(plaintext, { collegeId }) {
  if (!collegeId) throw new Error("collegeId is required to wrap a document key");

  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // One wrapped copy per principal allowed to read this document.
  const wrappedKeys = {
    [TNTEU_KEY_ID]: wrap(TNTEU_KEY_ID, dek),
    [collegeId]: wrap(collegeId, dek),
  };

  dek.fill(0);

  return {
    ciphertext,
    encryption: {
      algorithm: "aes-256-gcm",
      keyWrap: "rsa-oaep-sha256",
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      wrappedKeys,
      encryptedAt: new Date(),
    },
  };
}

export class DecryptionDeniedError extends Error {
  constructor(message) {
    super(message);
    this.status = 403;
  }
}

/**
 * Decrypt using whichever key the caller actually holds. TNTEU staff use the
 * TNTEU key; university staff use their own university's key and can therefore
 * only ever open their own applicants' documents.
 */
export function decryptDocument(ciphertext, encryption, { role, collegeId }) {
  if (!encryption?.wrappedKeys) throw new DecryptionDeniedError("Document has no encryption metadata");

  const keyId =
    role === "tnteu_admin"
      ? TNTEU_KEY_ID
      : ["college_admin", "college_coordinator"].includes(role)
        ? collegeId
        : null;

  if (!keyId) {
    throw new DecryptionDeniedError("Your role holds no decryption key for admission documents");
  }

  const wrapped = encryption.wrappedKeys[keyId];
  if (!wrapped) {
    throw new DecryptionDeniedError("No document key is wrapped for your institution");
  }

  const dek = unwrap(keyId, wrapped);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, Buffer.from(encryption.iv, "base64"));
    decipher.setAuthTag(Buffer.from(encryption.authTag, "base64"));
    // GCM verifies integrity on final(): a tampered ciphertext throws here
    // rather than returning corrupted bytes.
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } finally {
    dek.fill(0);
  }
}

// Used by the review UI to explain, in words, who can open a given document.
export function describeAccess(encryption) {
  const ids = Object.keys(encryption?.wrappedKeys || {});
  return ids.map((id) => (id === TNTEU_KEY_ID ? "TNTEU (super admin)" : `University ${id}`));
}
