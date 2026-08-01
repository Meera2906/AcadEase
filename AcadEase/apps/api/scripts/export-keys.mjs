// Prints the institutional key pairs as environment variables, so a deployment
// on an ephemeral filesystem keeps the same signing identity across redeploys.
//
// Without this, every deploy on Render's free tier generates a fresh key pair,
// and every certificate signed under the old one starts reporting itself as
// forged when somebody scans its QR code.
//
//   node scripts/export-keys.mjs                  # tnteu + every seeded college
//   node scripts/export-keys.mjs tnteu            # just one
//   node scripts/export-keys.mjs --render         # paste-ready for the Render dashboard
//
// The private key is printed. Treat the output like a password: paste it into
// the host's secret store, never into a commit.
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_DIR = process.env.DOC_KEY_DIR
  ? path.resolve(process.env.DOC_KEY_DIR)
  : path.resolve(__dirname, "../secure-storage/keys");

const renderMode = process.argv.includes("--render");
const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (!fs.existsSync(KEY_DIR)) {
  console.error(`No keyring at ${KEY_DIR}.`);
  console.error("Run the API once (or `npm run seed` then an e2e script) so the keys are generated first.");
  process.exit(1);
}

const keyIds = requested.length
  ? requested
  : [...new Set(
      fs.readdirSync(KEY_DIR)
        .filter((f) => f.endsWith(".key.pem"))
        .map((f) => f.replace(/\.key\.pem$/, ""))
    )];

if (keyIds.length === 0) {
  console.error(`No key pairs found in ${KEY_DIR}.`);
  process.exit(1);
}

const b64 = (file) => fs.readFileSync(file, "utf8").trim() && Buffer.from(fs.readFileSync(file, "utf8"), "utf8").toString("base64");

console.log(renderMode
  ? "# Paste each of these into Render → your service → Environment → Add Environment Variable\n"
  : "# Environment variables pinning the institutional keys\n");

let missing = 0;
for (const keyId of keyIds) {
  const safe = keyId.replace(/[^A-Za-z0-9_-]/g, "_");
  const privatePath = path.join(KEY_DIR, `${safe}.key.pem`);
  const publicPath = path.join(KEY_DIR, `${safe}.pub.pem`);

  if (!fs.existsSync(privatePath) || !fs.existsSync(publicPath)) {
    console.error(`# SKIPPED ${keyId} — incomplete key pair on disk`);
    missing += 1;
    continue;
  }

  const prefix = `KEY_${safe.toUpperCase()}`;
  console.log(`${prefix}_PRIVATE=${b64(privatePath)}`);
  console.log(`${prefix}_PUBLIC=${b64(publicPath)}`);
  console.log("");
}

console.log("# Also set DOC_KEY_PASSPHRASE to the exact value used when these keys were created —");
console.log("# the private keys above are encrypted under it and are useless without it.");

process.exit(missing > 0 ? 1 : 0);
