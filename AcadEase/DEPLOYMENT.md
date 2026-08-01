# Deploying AcadEase — Render (API) + Vercel (web)

Free tier throughout. Roughly 30 minutes end to end.

```
  Vercel (static SPA)          Render (Node API)         MongoDB Atlas
  acadease.vercel.app   ──►    acadease-api             M0 free cluster
                               .onrender.com      ──►
```

**Read [§1](#1-three-things-that-will-bite-you-on-free-tier) before you start.**
Three free-tier behaviours will break this app in ways that look like bugs, and
two of them are silent.

---

## 1. Three things that will bite you on free tier

### 1.1 The filesystem is wiped on every deploy — and that rotates your signing keys

AcadEase signs certificates with an RSA key pair stored under
`apps/api/secure-storage/keys/`, generated on first use. On Render's free tier
that directory does not survive a redeploy. A fresh pair is then generated
automatically — and **every certificate issued under the old key starts
reporting itself as forged** to anyone who scans its QR code. Nothing errors.
The certificates just quietly stop verifying.

**Fix: pin the keys to the environment** ([§4](#4-pin-the-signing-keys)). They
then survive redeploys, and `/health` will confirm it with
`"signingKeyPinned": true`.

Also lost on each deploy, and worth knowing:

| Directory | What goes | Consequence |
| --- | --- | --- |
| `storage/certificates/` | Generated certificate PDFs | The DB row survives; **the download 404s**. Verification by QR still works. |
| `secure-storage/admission-docs/` | Encrypted admission documents | Documents must be re-uploaded |
| `storage/study-materials`, `resumes`, `results` | Uploads | Re-upload |

For a demo, redeploy *before* you generate the data you plan to show, not after.
For anything real, attach a Render Disk (any paid instance) mounted at
`/opt/render/project/src/AcadEase/apps/api` — or move file storage to S3/R2.

### 1.2 The service sleeps after 15 minutes

Free Render instances spin down when idle and take **30–60 seconds** to wake.
The first request after a quiet period will look like the app is broken.

Before a demo, open `https://<your-api>.onrender.com/health` and wait for it to
answer. Keep the tab open. (An uptime pinger every 10 minutes also works, but it
burns your monthly free hours.)

### 1.3 The SPA and API are on different domains, so every cookie is third-party

The refresh token is an httpOnly cookie. Across origins a browser only sends it
if it is `SameSite=None; Secure`. With the usual `SameSite=Lax` it is dropped
silently — logins appear to work, then every session dies at the first token
refresh.

Already handled: `cookieOptions()` in
`apps/api/src/controllers/authController.js` switches automatically in
production, and `app.set("trust proxy", 1)` lets Express see Render's TLS so it
will set `Secure` at all. You just have to leave `COOKIE_CROSS_SITE=true` set.

---

## 2. MongoDB Atlas

1. <https://cloud.mongodb.com> → create a free **M0** cluster (region:
   Mumbai / `ap-south-1` if offered).
2. **Database Access** → add a user with *Read and write to any database*. Use a
   generated password with no `@ : / ?` in it, or URL-encode them.
3. **Network Access** → **Allow access from anywhere (`0.0.0.0/0`)**. Render's
   free tier has no static outbound IP, so an allowlist cannot work.
4. Copy the connection string and append a database name:

```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/acadease?retryWrites=true&w=majority
```

---

## 3. Generate your production secrets

```bash
# Run four times — one value each for the four secrets below
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Secret | Rule |
| --- | --- |
| `JWT_ACCESS_SECRET` | Any long random string |
| `JWT_REFRESH_SECRET` | Different from the access secret |
| `CERT_HMAC_SECRET` | **Never change it after the first certificate is issued** — every existing certificate fails its HMAC check |
| `DOC_KEY_PASSPHRASE` | **Never change or lose it** — it encrypts the private keys and every stored admission document |

Save all four somewhere durable now. Two of them cannot be rotated without
destroying data.

---

## 4. Pin the signing keys

Do this **locally, before the first deploy**, so production keeps one stable
signing identity.

```bash
cd AcadEase/apps/api

# 1. Put your production DOC_KEY_PASSPHRASE in .env — the keys are encrypted
#    under it and must be created with the value you will deploy with.
# 2. Generate the keyring by running anything that signs:
npm test

# 3. Print the keys as environment variables:
node scripts/export-keys.mjs --render
```

You get base64-encoded PEM pairs:

```
KEY_TNTEU_PRIVATE=LS0tLS1CRUdJTiBFTkNSWVBURUQg...
KEY_TNTEU_PUBLIC=LS0tLS1CRUdJTiBQVUJMSUMgS0VZ...
```

`KEY_TNTEU_*` is the one that matters — TNTEU signs every certificate. Add the
per-college pairs too if you want colleges' own approval signatures to be stable
across redeploys.

Treat the private values like passwords: they go in Render's environment, never
in a commit.

---

## 5. Deploy the API to Render

### Option A — Blueprint (uses the committed `render.yaml`)

1. <https://dashboard.render.com> → **New** → **Blueprint** → connect the repo.
2. Render reads `AcadEase/render.yaml` and creates the service.
3. Fill in every variable marked `sync: false` when prompted.

### Option B — manually

**New** → **Web Service** → connect the repo, then:

| Setting | Value |
| --- | --- |
| Root Directory | `AcadEase/apps/api` |
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Instance Type | Free |

### Environment variables

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGO_URI` | your Atlas string from §2 |
| `JWT_ACCESS_SECRET` | from §3 |
| `JWT_REFRESH_SECRET` | from §3 |
| `CERT_HMAC_SECRET` | from §3 |
| `DOC_KEY_PASSPHRASE` | from §3 — must match what you used in §4 |
| `KEY_TNTEU_PRIVATE` | from §4 |
| `KEY_TNTEU_PUBLIC` | from §4 |
| `COOKIE_CROSS_SITE` | `true` |
| `ALLOW_VERCEL_PREVIEWS` | `true` |
| `CLIENT_URL` | *leave blank for now — §7* |
| `API_URL` | `https://<your-service>.onrender.com` |
| `INSTITUTION_ID` | `TNTEU_001` |
| `INSTITUTION_NAME` | `Tamil Nadu Teachers Education University` |
| `TOTP_ISSUER` | `AcadEase` |

`SMTP_*` and `TWILIO_*` are optional; email and SMS are simply skipped without
them.

Deploy, then check:

```bash
curl https://<your-service>.onrender.com/health
```

```json
{
  "status": "ok",
  "database": "connected",
  "signingKeyPinned": true
}
```

If `signingKeyPinned` is `false`, go back to §4 — otherwise your first redeploy
silently invalidates every certificate issued before it.

---

## 6. Deploy the web app to Vercel

<https://vercel.com/new> → import the repo:

| Setting | Value |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `AcadEase/apps/web` |
| Build Command | `npm run build` *(default)* |
| Output Directory | `dist` *(default)* |

Environment variable:

| Key | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://<your-service>.onrender.com/api` |

The `/api` suffix is required.

> `VITE_*` values are baked in at **build** time. Changing this variable later
> needs a **redeploy**, not just a restart.

`apps/web/vercel.json` already handles the SPA rewrite — without it, a hard
refresh on `/admin/umis` or a scanned QR pointing at `/verify/<id>` would 404.

---

## 7. Close the loop (the step everyone forgets)

Go back to Render → your service → Environment:

```
CLIENT_URL = https://<your-project>.vercel.app
```

No trailing slash. Save — Render redeploys.

This one variable drives three things: the CORS allowlist, the `frame-ancestors`
header, and the base URL printed into certificate QR codes. Until it is set, the
front end gets CORS errors on every request.

Multiple origins are allowed, comma-separated:

```
CLIENT_URL = https://acadease.vercel.app,https://acadease-git-main-you.vercel.app
```

---

## 8. Seed production data

Seeding runs from your machine against the production database. **These scripts
delete before they write** — only ever run them against a database you are
willing to lose.

```bash
cd AcadEase/apps/api
MONGO_URI="<your Atlas string>" npm run seed
MONGO_URI="<your Atlas string>" npm run seed:governance
```

`seed:admissions` only writes local demo files and does not need this.

---

## 9. Verify the deployment

```bash
API=https://<your-service>.onrender.com

# 1. Alive, connected, keys pinned
curl -s $API/health

# 2. CORS allows your front end
curl -si -X OPTIONS $API/api/auth/login \
  -H "Origin: https://<your-project>.vercel.app" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow

# 3. Cross-site cookies are set correctly
curl -si -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"STU_2021_CS_001","password":"Demo@2025"}' | grep -i set-cookie
#    → must contain: SameSite=None; Secure
```

Then in the browser:

1. Open the Vercel URL → log in as `STU_2021_CS_001` / `Demo@2025`.
2. Hard-refresh on a deep route such as `/student/results` → loads, no 404.
   *(Fails → the SPA rewrite is not applying.)*
3. Leave the tab for 20 minutes, come back, click something → still logged in.
   *(Fails → the refresh cookie is not crossing origins; recheck §1.3 and §7.)*
4. Open a certificate's QR URL in a private window → verifies with no login.
5. Log in as `SUP_001`, complete TOTP setup, open **Analysis** → real data.

---

## 10. Common failures

| Symptom | Cause |
| --- | --- |
| `Origin ... is not allowed by CORS` | `CLIENT_URL` unset, or has a trailing slash. §7. |
| Login works, then logged out on refresh | Cookie not crossing origins. Confirm `COOKIE_CROSS_SITE=true` and that `Set-Cookie` carries `SameSite=None; Secure`. |
| First request of the day takes a minute | Free instance was asleep. §1.2. |
| Every certificate reports "signature invalid" | `CERT_HMAC_SECRET` changed between deploys. |
| Certificates verify but `chainValid: false` | The RSA keyring rotated. `signingKeyPinned` was false. §4. |
| Certificate download 404s, QR still verifies | The PDF was on the ephemeral disk. §1.1. |
| `MongoServerError: bad auth` | Password not URL-encoded, or the Atlas user lacks write access. |
| Connection timeouts to Atlas | Network Access is not `0.0.0.0/0`. §2. |
| 404 on refresh at `/admin/umis` | Vercel root directory is wrong, so `vercel.json` was not picked up. |
| `VITE_API_BASE_URL` change had no effect | Baked in at build time — redeploy. |
| Uploads vanish after a deploy | Ephemeral filesystem. §1.1. |

---

## 11. Hardening before this carries real student data

Free-tier shortcuts that are fine for a demo and not fine in production:

- **Attach persistent storage** (Render Disk, or S3/R2) for certificates and
  admission documents.
- **Lock Atlas network access** to fixed egress IPs instead of `0.0.0.0/0`.
- **Turn off `ALLOW_VERCEL_PREVIEWS`** and pin `CLIENT_URL` to the production
  domain only.
- **Rotate the seeded `Demo@2025` accounts** — or delete them entirely.
- **Back up the keyring and both non-rotatable secrets** (`CERT_HMAC_SECRET`,
  `DOC_KEY_PASSPHRASE`) somewhere durable. Losing them is unrecoverable: every
  issued certificate and every stored document becomes permanently unverifiable
  or unreadable.
- **Move the TOTP QR renderer off the public API.** `apps/web/src/pages/Login.jsx`
  currently builds the enrolment QR via `api.qrserver.com`, which means the
  otpauth URL — containing the TOTP secret — leaves your infrastructure. Render
  it client-side instead.
