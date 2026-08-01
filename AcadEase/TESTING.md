# AcadEase — test guide

How to verify the whole system yourself, from a cold clone to the last feature.
Work top to bottom the first time; after that, jump to the section you care
about.

- [0. Setup](#0-setup)
- [1. Automated tests](#1-automated-tests-5-minutes)
- [2. Manual walkthrough](#2-manual-walkthrough)
- [3. Security checks](#3-security-checks-worth-doing-yourself)
- [4. Troubleshooting](#4-troubleshooting)
- [5. Coverage map](#5-what-is-and-isnt-covered)

---

## 0. Setup

### Prerequisites
- Node.js 20+
- A MongoDB instance (local `mongodb://127.0.0.1:27017/acadease`, or Atlas)

### Install

```bash
cd AcadEase/apps/api && npm install
cd ../web && npm install
```

### Configure

```bash
cd AcadEase/apps/api && cp .env.example .env
cd ../web && cp .env.example .env
```

In `apps/api/.env` you must set, at minimum:

| Variable | Why it matters |
| --- | --- |
| `MONGO_URI` | Where the data goes |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Any long random strings |
| `CERT_HMAC_SECRET` | **Changing this later invalidates every certificate already issued** |
| `DOC_KEY_PASSPHRASE` | **Losing this makes every stored admission document permanently unreadable** |

### Seed

```bash
cd AcadEase/apps/api
npm run seed              # 3 colleges, users, attendance, results, certificates
npm run seed:admissions   # writes demo-data/ + a second university admin
npm run seed:governance   # cross-college students, applicants, college requests, circulars
```

> `npm run seed` and `npm run seed:governance` are **destructive** — they clear
> collections before writing. Never point them at a database you care about.

`seed:admissions` is different: it writes `apps/api/demo-data/` to disk and
inserts almost nothing. You upload that package through the UI, so the demo runs
the real import, hashing and flagging path rather than a shortcut.

### Run

```bash
cd AcadEase/apps/api && npm run dev     # http://localhost:5000
cd AcadEase/apps/web && npm run dev     # http://localhost:5173
```

Health check: <http://localhost:5000/health> should report
`"database": "connected"`.

### Accounts

All passwords: `Demo@2025`

| Role | User ID | Notes |
| --- | --- | --- |
| TNTEU super admin | `SUP_001` | Requires TOTP |
| University admin — Kongu College of Education | `ADM_CSE_001` | Requires TOTP |
| University admin — Sankara Teacher Training College | `ADM_0912_001` | Requires TOTP; use this to test tenant isolation |
| University admin — Vellore B.Ed Academy | `ADM_1188_001` | Requires TOTP |
| Faculty | `FAC_CSE_001` | Requires TOTP |
| Student | `STU_2021_CS_001` | No TOTP |

**First staff login sets up 2FA.** You enter the password, the app shows a QR
code, you scan it with Google Authenticator / Authy / any TOTP app, then enter
the 6-digit code. Do this for `SUP_001` and `ADM_CSE_001` *before* a live demo —
it takes 30 seconds each and it is the only part of the flow that needs a phone.

---

## 1. Automated tests (5 minutes)

### Unit tests — no database needed

```bash
cd AcadEase/apps/api && npm test
```

Expect **77 passing, 0 failing**. These cover the pure logic: admission rules
and flag detection, the approval-chain signatures, tenant scoping, the two-stage
review gate, pre-admission eligibility, TN document handling, certificate
signing, and notifications.

### End-to-end tests — hits a real database

> **Destructive.** These delete and recreate their own test records. Run them
> against a development database only.

```bash
cd AcadEase/apps/api

npm run e2e:admissions     # bulk import, flags, verification, tenant boundary
npm run e2e:preadmission   # applicant self-service portal
npm run e2e:signedflow     # college requests + counter-signed merit certificate
npm run e2e:twostage       # college stage → TNTEU stage review chain
npm run e2e:reissue        # grievance → certificate revoke-and-reissue

npm run e2e                # all five, in order
```

Each prints `PASS` / `FAIL` per assertion and exits non-zero on any failure.
A clean run ends with `ALL CHECKS PASSED`.

**`e2e:reissue` is the one to run if you only run one.** Its 40 assertions cover
the feature that ties the platform together, including the cases where it must
*not* fire:

- an infrastructure grievance reissues nothing, even with `recordCorrected` set
- resolving without `recordCorrected` (the mark was explained, not changed)
  reissues nothing
- correcting the record supersedes the old certificate and issues a replacement
- the old QR still resolves, reports `superseded`, and names its replacement
- the replacement's signature and full approval chain both verify
- the chain still carries the *original* college approval, not just the reissue
- resolving twice does not revoke the replacement

---

## 2. Manual walkthrough

Roughly 25 minutes end to end. Each step says what you should see.

### 2.1 Bulk submission (as `ADM_CSE_001`)

1. **Bulk Submission** → upload `apps/api/demo-data/applicants.csv`.
   → 7 applicants imported; **2 rows rejected** with per-row reasons (one has an
   unsupported programme, one has no applicant ID).
2. Upload every file in `apps/api/demo-data/documents/`.
   → each file matched to its applicant by the `<applicantId>__<type>` filename.
3. **Applicants** → 7 rows, each with a document checklist.
   → APP_2025_005 shows **4/5** — its transfer certificate was never submitted.

### 2.2 Flag detection (as `ADM_CSE_001`)

**Verify Documents** — the queue is sorted flagged-first. Confirm each planted
issue fires (they are tabulated in `apps/api/demo-data/README.md`):

| Applicant | Expected flag |
| --- | --- |
| APP_2025_003 — 10th marksheet | `duplicate_hash` — byte-identical to APP_2025_001's |
| APP_2025_004 — transfer certificate | `name_mismatch` — issued to a different person |
| APP_2025_005 — 12th marksheet | `missing_field` — no register number |
| APP_2025_005 — ID proof | `unreadable` — an image scan with no text layer |
| APP_2025_006 — community certificate | `expired_document` — lapsed in 2022 |

Open one and check the reviewer gets the *reason*, not just a red label —
`duplicate_hash` should name the other applicant.

### 2.3 Bulk approval and its gate (as `ADM_CSE_001`)

1. Tick a flagged document and an unflagged one → **Approve**.
   → the unflagged one clears; the flagged one is **refused** and listed as
   needing individual review.
2. **Approve all eligible** → every unflagged document in the queue clears at
   once; the flagged ones remain.
3. Try **Reject** with an empty reason → refused (a reason is mandatory, and it
   is signed).

*This gate is the core claim. If a flagged document can be bulk-approved, that
is a bug — please report it.*

### 2.4 Two-stage review (as `SUP_001`)

1. As `SUP_001` → **Verification**.
   → the documents `ADM_CSE_001` just approved are now here. Documents the
   college has **not** approved are not visible: TNTEU's desk only shows stage
   two.
2. Approve them → status becomes `verified`. Only a TNTEU approval can do that.
3. Bulk-approve works identically here, with the same flag gate.

### 2.5 Tenant isolation (as `ADM_0912_001`)

Log in as the Sankara admin.
→ **Applicants** does not contain a single Kongu applicant.
→ Paste a Kongu applicant's URL directly → **404**, not 403. The record is
absent from the query, not filtered from the response.

### 2.6 Certificates (student → college → TNTEU)

1. As `STU_2021_CS_001` → **Certificates** → request a **merit** certificate.
   → if the student is not eligible the server refuses with the reason
   (merit needs ≥75% and no arrears — checked server-side against published
   results, not taken on trust).
2. As `ADM_CSE_001` → **Certificates** → approve. → forwarded to TNTEU; no PDF
   exists yet.
3. As `SUP_001` → approve. → **now** the PDF is generated.
4. As the student → download it. Scan the QR (or open `/verify/<certId>`).
   → *Certificate Valid*, both institutional signatures listed, and **no marks,
   attendance or contact details** on the public page.

### 2.7 The payoff — grievance → certificate reissue

This is the feature to check most carefully.

1. **As the student**, → **Grievances** → New:
   - Category: **Academic**
   - *"Which result is this about?"* → pick the semester the merit certificate
     came from. (This dropdown only appears for Academic grievances.)
   - Subject: *"Databases mark entered as 88 instead of 94"*
2. **As `ADM_CSE_001`** → **Grievances** → **Acknowledge**.
   → the resolve panel now shows a warning: *"1 active certificate (merit) was
   issued from this record."*
3. **Resolve without ticking the box**, with a note like *"Re-checked, the
   original mark was correct."*
   → **nothing is reissued.** Re-scan the certificate QR — still valid. This is
   the important negative case.
4. Raise a second grievance the same way, acknowledge it, then **tick "the
   result record was corrected"** and resolve.
   → toast: *"1 certificate superseded and reissued."*
   → the grievance card lists `oldCertId → newCertId`.
5. **Scan the OLD QR.** → *"Superseded — a corrected certificate was issued"*,
   in blue rather than red, with a link to the replacement. It must **not** say
   "revoked by the institution" — that would wrongly imply misconduct.
6. **Scan the NEW QR.** → valid; its own HMAC; and the approval chain still
   lists `college_review`, `tnteu_review` **and** a `reissued` link, all
   verifying.
7. **As the student** → **Certificates** → the replacement is already there, and
   a notification arrived.

Also confirm the guard rails:
- Raise an **Infrastructure** grievance (no result dropdown appears) and resolve
  it → no certificate is touched.
- Press **Resolve** twice on an already-resolved grievance → the replacement is
  *not* revoked and re-minted.

### 2.8 Super admin oversight (as `SUP_001`)

- **Analysis** — three colleges with genuinely different numbers (seats filled,
  approval rate, attendance, pending work). Cross-check one against
  `GET /api/admin/analytics/colleges` — the page holds no hardcoded figures.
- **Student Data (UMIS)** — 150+ students across all three colleges. Search,
  filter by college/department/status, open a file. It is read-only by design;
  there is no edit control anywhere on it.
- **College Requests** — 9 seeded requests including three seat-matrix
  revisions. Open the urgent Kongu one (100→150 B.Ed seats) → approve it → a
  **signed decision order** comes back with a key fingerprint. Open the Vellore
  one → it is in `clarification_requested` with a TNTEU message on the thread.
- **Circulars** — create one for **Faculty + Admins** only. Log in as a student
  → it does **not** appear in their feed. Create one for Students → it does.

### 2.9 Everyday academics

- **Faculty `FAC_CSE_001`** → Mark Attendance (roster loads, OD requests
  reflected), Results (enter marks → submit for review).
- **Student** → Dashboard (attendance ring, XP, circulars), Attendance,
  Results, OD Requests, Study Materials (upload a PDF of past questions → the
  PYQ practice panel extracts questions from it).
- **`ADM_CSE_001`** → Users, Departments, Courses, Attendance, Results,
  Reports.

---

## 3. Security checks worth doing yourself

Don't take the claims on trust — these are quick.

**Tenant boundary.** As `ADM_0912_001`, request another college's applicant,
document and university request by ID. All should be 404.

**Public verification leaks nothing.** `curl` the verify endpoint with no auth:
```bash
curl -s http://localhost:5000/api/certificates/verify/<certId> | json_pp
```
It must return name / type / date / institution / signatures and **nothing
else** — no marks, no attendance, no email, no phone.

**Tampering breaks the chain.** In MongoDB, edit a `remarks` field inside a
certificate's `approvalChain`, then re-verify. → `chainValid: false`, and the
altered link reports *"Signature does not match the recorded decision."*

**A signature cannot be moved between records.** Copy an approval link from one
certificate's chain onto another's. → *"This approval was signed for a different
record."*

**Documents are encrypted at rest.** Open any file under
`apps/api/secure-storage/admission-docs/` in a text editor. → ciphertext. It is
only decryptable through the API by TNTEU or the owning college.

**2FA cannot be skipped.** POST to `/api/auth/login` as `SUP_001` with the right
password → you get `requiresTotp`, **not** an access token.

**Rate limiting.** Fire 60 rapid bad logins → HTTP 429. Five bad passwords on
one account → that account locks for 15 minutes.

**CSRF.** POST anything with a valid Bearer token but no `X-CSRF-Token` header
→ 403.

---

## 4. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `MONGO_URI` errors on any script | `.env` missing or unreadable. `cp .env.example .env` in `apps/api`. |
| Staff login loops back to the password screen | 2FA is not set up yet. The QR screen appears on first login — scan it, then enter a code. |
| Every certificate suddenly reports "signature invalid" | `CERT_HMAC_SECRET` changed. Restore the original value. |
| "Keyring for X is incomplete" | Half a key pair is on disk. Restore it from backup — the app deliberately refuses to generate a replacement, because that would invalidate every signature ever made with that key. |
| Stored documents will not open | `DOC_KEY_PASSPHRASE` changed. Restore the original. |
| Analysis page shows three colleges with almost no data | `npm run seed:governance` was not run. |
| `seed:governance` says "run npm run seed first" | The colleges do not exist yet. Run `npm run seed`. |
| Verification queue is empty as `SUP_001` | Correct — TNTEU only sees stage two. The college must approve first. |
| Reissue did not fire | The grievance did not name a record (was it Academic, with a result selected?), or *"the record was corrected"* was not ticked. Check `GET /api/grievances/:id/certificate-impact`. |
| E2E script hangs | It could not reach MongoDB. Check `/health`. |

---

## 5. What is and isn't covered

**Automated:** admission rules and all nine flags · approval-chain signing and
verification · tenant scoping · the two-stage review gate · pre-admission
eligibility · TN document handling · certificate signing · notifications · the
full grievance→reissue path with its negatives and idempotence · bulk import
and the bulk-approval gate · the applicant self-service portal · college
requests and signed decision orders.

**Manual only:** everything visual — dashboards, charts, responsive layout ·
PDF rendering quality · the TOTP enrolment screen · study materials and PYQ
extraction · email and SMS delivery (both need real credentials and are
optional).

**Not tested at all:** load and concurrency at 640-college scale · browsers
other than current Chrome/Edge/Firefox · offline behaviour · the Web Push path
(`subscribePush` is a stub).
