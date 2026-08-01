# AcadEase

**Admission document verification at university scale, and the academic
lifecycle that hangs off it.**

> 📣 **[Read PITCH.md](./PITCH.md)** — the problem, why there is no AI approving
> documents, and the one feature that ties the platform together.
>
> 🧪 [TESTING.md](./TESTING.md) · 🚀 [DEPLOYMENT.md](./DEPLOYMENT.md) ·
> 🏗 [ARCHITECTURE.md](./ARCHITECTURE.md) ·
> 🔍 [VERIFICATION-TESTING.md](./VERIFICATION-TESTING.md)

---

## What this is

TNTEU — Tamil Nadu Teachers Education University — is an affiliating university
overseeing **640 affiliated B.Ed and M.Ed colleges**. It does not teach. Its work
is paperwork arriving from somewhere else that a human then has to check.

The specific bottleneck: when students apply for admission, colleges submit their
documents to TNTEU, and **TNTEU's teaching staff cross-verify every one of them
by hand**. That does not scale to 640 colleges' worth of applicants.

AcadEase attacks that directly. Colleges bulk-submit applicant documents; the
system runs **deterministic** checks at upload (duplicate file hashes, missing
fields, name mismatches, lapsed dates) and surfaces flags; reviewers work a
queue sorted flagged-first instead of a pile, and can clear provably-clean
documents in bulk while flagged ones are **refused by the gate** and must be
opened individually.

Nothing is auto-approved. The system decides what deserves attention; a human
decides what is true.

Around that core sits the rest of the lifecycle for the same student — results,
attendance, counter-signed certificates, grievances — on one record, so that
**correcting a disputed mark automatically revokes and reissues the certificate
that was built on it** rather than leaving a signed PDF in the world that no
longer matches.

---

## Features

Everything listed here is implemented and runnable today. Planned work is kept
separate, in [PITCH.md §7](./PITCH.md#7-whats-next).

### Admission verification — the core

- **Bulk submission** — one applicant CSV plus a folder of documents named
  `<applicantId>__<documentType>.pdf`; per-row import report with reasons for
  every rejected row.
- **Nine deterministic flags** at upload: `duplicate_hash` (SHA-256,
  system-wide), `duplicate_resubmit`, `name_mismatch`, `missing_field`,
  `expired_document`, `future_date`, `unreadable`, `type_unconfirmed`,
  `cross_document_mismatch`.
- **Two-stage review chain** — the college approves its own applicants'
  documents first; only a TNTEU counter-approval can mark a document
  `verified`. The same screens serve both stages; the server decides from your
  role what you see and what you can act on.
- **Bulk approval with a gate** — sweep every eligible document at once, but a
  flagged document can never be bulk-approved, and every approval re-hashes the
  stored file and re-checks for duplicates at decision time.
- **Applicant self-service portal** — applicants can register and upload
  directly, on a scoped session that stops working the moment they are enrolled.
- **Documents encrypted at rest** — envelope encryption, readable only by TNTEU
  and the submitting college.

### Certificates

- Two-stage approval: student request → college → TNTEU counter-signature → PDF
  generated server-side, and not before.
- **HMAC-SHA256** over the certificate's identity fields, plus an **RSA-PSS
  counter-signature chain** where each link signs the previous link's signature,
  so a stage cannot be removed, reordered or edited undetected.
- **Public QR verification** with no login, exposing only name, type, issue
  date, institution and which institutions signed — no marks, no attendance, no
  contact details.
- Server-side eligibility (a merit certificate is checked against published
  results) and admin revocation.

### Grievance → certificate reissue

- Students raise grievances; staff acknowledge, resolve or reject with a
  recorded reason; students rate the outcome.
- An **Academic** grievance can name the result it disputes.
- Resolving it with *"the record was corrected"* ticked **revokes the affected
  certificate as `superseded` and issues a signed replacement automatically** —
  linked in both directions, with the old QR still resolving and pointing at the
  new one. Scoped to certificate types actually derived from that record; a
  complaint about a broken projector can never touch a certificate.
- The admin sees exactly which certificates will be affected *before* resolving.

### TNTEU (super admin) oversight

- **College-wise Analysis** — every affiliated college on one page: seat
  utilisation against its own sanctioned matrix, admission approval rates,
  average attendance, chronic absentees, pending documents and requests, open
  grievances.
- **UMIS student register** — read-only lookup of any student at any affiliated
  college, searchable and filterable, with every file opened written to the
  audit log.
- **College Requests** — affiliation renewals, seat matrix revisions, new
  programmes, faculty recognition, exam centre designation. Encrypted
  attachments, a two-way clarification thread, and a **digitally signed decision
  order** the college can show to anyone.
- **Circular distribution** — one circular to any combination of students,
  faculty and admins, across every affiliated college at once.

### Academic modules

- **Attendance** — faculty marking by course and session, OD requests with an
  approval flow, per-student and per-course analytics, chronic-absentee
  detection.
- **Results** — assessment marks entry, semester compilation, review before
  publication, PDF generation, student-facing results and sessions.
- **Study materials** — uploads by subject and module type (academic / TET),
  plus PYQ practice that extracts questions from an uploaded past paper and runs
  a timed quiz.
- **Notifications** — in-app, live over Server-Sent Events, with optional email
  (SMTP) and SMS (Twilio).
- **Gamification** — XP ledger, attendance streaks, leaderboard.

### Security

- JWT access tokens held **in memory** (never localStorage) with an httpOnly
  refresh cookie and CSRF double-submit.
- **TOTP 2FA mandatory** for faculty, college admin, coordinator and TNTEU
  admin.
- Account lockout after 5 failed passwords; per-IP rate limiting on auth.
- **Tenant isolation enforced at the query layer** — see below.
- Audit logging on privileged actions, including every UMIS record opened.

---

## Role hierarchy

| Role | Can do | Scope |
| --- | --- | --- |
| **`tnteu_admin`** — super admin (TNTEU) | Final verification authority; counter-signs certificates; decides college requests; college-wise analysis; UMIS student register; issues university-wide circulars | **All colleges** |
| **`college_admin`** — university admin | Bulk-submits applicants and documents; stage-one document verification; raises requests to TNTEU; runs the college's users, courses, attendance, results, grievances and reports | **Own college** |
| **`college_coordinator`** | Delegated oversight within one college — same tenant boundary, narrower authority than a college admin | **Own college** |
| **`faculty`** | Marks attendance, enters assessment marks and results, handles OD requests, uploads study materials, issues circulars | **Own department** |
| **`student`** | Own dashboard, attendance, results, certificates, grievances, OD requests, study materials | **Themselves** |

Legacy tokens spelling these `admin` / `superadmin` are normalised on the way in
(`normalizeRole`, `apps/api/src/middleware/auth.js`).

### Tenant isolation

Every request carries a college scope derived from its token, and every
multi-tenant query is **built through that scope** rather than filtered
afterwards — `buildCollegeScope` / `applyCollegeScope` in
`apps/api/src/middleware/auth.js`, and the `scoped()` helpers in
`admissionController.js` and `universityRequestController.js`.

A college admin asking for "all applicants" has the query rewritten to "all
applicants at my college" before it reaches MongoDB. Fetching another college's
record by ID returns **404, not 403** — the record is absent from the result set,
not hidden from the response. `tnteu_admin` is the only role whose scope
resolves to `{}`. Covered by `apps/api/test/tenantScope.test.js`.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, Vite 5, Tailwind CSS, React Router 6, Axios, Lucide |
| Backend | Node.js 20, Express 4 (ESM) |
| Database | MongoDB + Mongoose 8 — 23 models |
| Auth | JWT, bcrypt, otplib (TOTP), CSRF double-submit |
| Crypto | RSA-PSS 3072 signatures, HMAC-SHA256, AES envelope encryption |
| Files | Multer, pdfkit (generation), pdf-parse (extraction), qrcode, jsQR |
| Notifications | Server-Sent Events, Nodemailer (optional), Twilio (optional) |
| Tests | `node --test` — 77 unit tests + 5 end-to-end scripts |

---

## Project structure

```text
AcadEase/
├── PITCH.md                    ← the jury narrative
├── TESTING.md                  ← how to verify everything
├── DEPLOYMENT.md               ← Render + Vercel
├── ARCHITECTURE.md
├── VERIFICATION-TESTING.md     ← deep dive on the verification rules
├── render.yaml                 ← Render blueprint for the API
└── apps/
    ├── api/
    │   ├── src/
    │   │   ├── controllers/    admission · certificate · grievance · analytics
    │   │   │                   umis · universityRequest · attendance
    │   │   │                   assessment · applicant · auth · misc
    │   │   ├── models/         23 Mongoose models
    │   │   ├── routes/         one router per domain
    │   │   ├── middleware/     auth + tenant scoping, error handling
    │   │   ├── utils/          admissionRules · approvalChain · keyring
    │   │   │                   documentCrypto · certificate
    │   │   │                   certificateReissue · notify · eligibility
    │   │   │                   tnDocuments · qrAuthenticity …
    │   │   └── seed/           seed · seedAdmissions · seedGovernance
    │   ├── scripts/            export-keys.mjs — pin signing keys for deploy
    │   ├── test/               8 unit test files
    │   ├── e2e-*.mjs           5 end-to-end scripts
    │   ├── demo-data/          generated by seed:admissions (git-ignored)
    │   ├── storage/            uploads + generated PDFs (git-ignored)
    │   └── secure-storage/     encrypted documents + RSA keyring (git-ignored)
    └── web/
        ├── src/
        │   ├── pages/          student · faculty · admin · apply · verify
        │   ├── components/     layout · ui · dashboard · study
        │   ├── context/        AuthContext, ApplicantContext
        │   ├── api/            axios client, token refresh, CSRF
        │   └── routes/         ProtectedRoute
        ├── _prototypes/        design mockups on static data — NOT wired into
        │                       the app; kept for reference only
        └── vercel.json         SPA rewrite + cache headers
```

---

## Getting started

### Prerequisites
- Node.js 20+
- A MongoDB instance (local `mongodb://127.0.0.1:27017/acadease`, or Atlas)

### 1. Install

```bash
cd AcadEase/apps/api && npm install
cd ../web && npm install
```

### 2. Configure

```bash
cd AcadEase/apps/api && cp .env.example .env
cd ../web && cp .env.example .env
```

Set `MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CERT_HMAC_SECRET`
and `DOC_KEY_PASSPHRASE` in `apps/api/.env`.

> `CERT_HMAC_SECRET` and `DOC_KEY_PASSPHRASE` cannot be rotated after the fact.
> Changing the first invalidates every certificate already issued; losing the
> second makes every stored admission document permanently unreadable.

### 3. Seed demo data

```bash
cd AcadEase/apps/api
npm run seed              # 3 colleges, users, attendance, results, certificates
npm run seed:admissions   # writes demo-data/ + a second university admin
npm run seed:governance   # cross-college students, applicants, college requests, circulars
```

`seed` and `seed:governance` are **destructive** — they clear collections first.
Never point them at a database you care about.

`seed:admissions` is different: it writes `apps/api/demo-data/` (an applicant CSV
and 35 document PDFs, several deliberately flawed) and inserts almost nothing.
You upload that package through the UI, so the demo exercises the real import,
hashing and flagging path. `demo-data/README.md` tabulates the planted issues.

### 4. Run

```bash
cd AcadEase/apps/api && npm run dev     # http://localhost:5000
cd AcadEase/apps/web && npm run dev     # http://localhost:5173
```

Then open <http://localhost:5173>. Health check: <http://localhost:5000/health>.

---

## Demo accounts

Password for all: `Demo@2025`

| Role | User ID |
| --- | --- |
| TNTEU super admin | `SUP_001` |
| University admin — Kongu College of Education | `ADM_CSE_001` |
| University admin — Sankara Teacher Training College | `ADM_0912_001` |
| University admin — Vellore B.Ed Academy | `ADM_1188_001` |
| Faculty | `FAC_CSE_001` |
| Student | `STU_2021_CS_001` |

Every staff account requires TOTP; the first login shows a QR to scan with any
authenticator app. **Do this before a live demo** — it is the only step that
needs a phone.

Three university admins are seeded so the tenant boundary is demonstrable: log
in as `ADM_0912_001` after submitting a batch as `ADM_CSE_001` and the applicant
list is empty.

---

## Testing

```bash
cd AcadEase/apps/api
npm test              # 77 unit tests, no database needed
npm run e2e           # all 5 end-to-end scripts (destructive — dev DB only)
npm run e2e:reissue   # the grievance → certificate reissue path, 40 assertions
```

Full manual walkthrough, security checks you can run yourself, and a
troubleshooting table: **[TESTING.md](./TESTING.md)**.

---

## Deployment

Render (API) + Vercel (web), free tier: **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

Read §1 first — three free-tier behaviours will break the app in ways that look
like bugs, and two of them are silent: the RSA signing keys rotate on every
redeploy (invalidating issued certificates), and cross-origin cookies get
dropped unless `SameSite=None; Secure` is set.

---

## Team

**SafeCircle** — Sri Krishna College of Engineering and Technology, Coimbatore

- Meera
- Niranjana
- Mayurika
- Monisha
