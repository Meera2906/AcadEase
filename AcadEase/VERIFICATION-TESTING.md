# Two-Stage Document Verification — Test Guide

## What was built

```
applicant uploads  →  instant checks refuse the obviously bad
       ↓
applicant submits  →  stage 1: THEIR UNIVERSITY approves (bulk) or rejects
       ↓
                      stage 2: TNTEU SUPER ADMIN approves (bulk) or rejects
       ↓
                      verified  →  applicant can be enrolled
```

**Only "clean" documents can be bulk-approved.** Anything an automated check
flagged has to be opened and decided one by one. Every approval — bulk or
individual — re-hashes the stored file and re-checks for duplicates first, then
is counter-signed with the deciding institution's private RSA key.

---

## Setup (once)

```bash
cd apps/api
cp .env.example .env          # set MONGO_URI, JWT secrets, DOC_KEY_PASSPHRASE
npm install
npm run seed                  # colleges + staff accounts
npm run seed:admissions       # demo CSV + 35 document PDFs in demo-data/
npm run dev                   # API on :5000

cd ../web && npm install && npm run dev    # UI on :5173
```

---

## A. Automated tests (fastest proof)

```bash
cd apps/api
npm test                # 76 unit tests — includes the bulk gate's classification rules
npm run e2e:twostage    # 44 checks — the whole chain end to end
npm run e2e             # all four e2e scripts
```

`npm run e2e:twostage` is the one to run. It proves, against a real database
and a real HTTP server:

| # | What it proves |
|---|---|
| 1 | Faculty/students have no queue; a university sees only its own applicants |
| 2 | Bulk approval **refuses** the flagged documents and says why |
| 3 | Neither institution can act at the other's stage |
| 4 | A file swapped on disk after approval is caught and permanently flagged |
| 5 | TNTEU's approval — not the university's — is what marks a document verified |
| 6 | Signatures are per-institution, ordered, and break if edited, moved or removed |
| 7 | Bulk rejection works and never lets a rejected document reach TNTEU |
| 8 | Every decision is in the audit log with its stage |

---

## B. Manual walkthrough (~10 min)

### Logins (from `npm run seed`)

| Role | User ID | Where |
|---|---|---|
| University admin | `ADM_CSE_001` | stage 1 |
| TNTEU super admin | `SUP_001` | stage 2 |

> **If the import rejects every row with "applicantId already submitted by your
> university"**, the demo applicants are already in the database from an earlier
> run or from `npm run e2e`. Clear them and try again:
>
> ```bash
> cd apps/api && npm run reset:admissions
> ```
>
> This removes only the demo/test fixtures (`APP_2025_*`, `APL_*`, `E2E2_*`) plus
> their encrypted files, import batches and enrolled student accounts. Colleges
> and staff logins are untouched. Add `--all` to wipe every applicant.

### 1 — Get documents into the system

Sign in as **ADM_CSE_001** → **Bulk Submission**

- Upload `apps/api/demo-data/applicants.csv` → 7 imported, 2 rejected
- Upload all files in `apps/api/demo-data/documents/` → 35 stored, **5 flagged**

### 2 — Stage 1: university bulk approval

Sign in as **ADM_CSE_001** → **Verify Documents**

| Check | Expected |
|---|---|
| Header | "Stage 1 of 2" |
| Bulk-approvable tile | **30** (35 minus the 5 flagged) |
| Flagged rows | red/amber left border, labelled *Suspect* or *Needs a look* |
| Click **"Select 20 clean on this page"** | only unflagged rows tick |
| Click **"Approve & send to TNTEU"** | green report: *N approved and forwarded* |
| Tick a **Suspect** row, then Approve | it is **held back**, listed with the reason |
| Click **"Approve & send to TNTEU — all 30 clean"** | sweeps the rest of the backlog |

> The one to watch: **APP_2025_003's 10th marksheet** is byte-identical to
> APP_2025_001's. Bulk approval refuses **both** — even the original, which was
> clean at upload. Open either one to see the other applicant named.

### 3 — Reject a bad document

Still as ADM_CSE_001, tick a Suspect row → **Reject** → type a reason (5+ chars)
→ Confirm.

- The document goes straight to `rejected`, **never reaches TNTEU**
- The applicant's overall status turns `rejected`
- The reason is stored as `University review: <your text>` and is signed

### 4 — Stage 2: TNTEU bulk approval

Sign out, sign in as **SUP_001** → **Verification**

| Check | Expected |
|---|---|
| Header | "Stage 2 of 2" |
| Queue contents | only what the university forwarded — nothing else |
| Each row | shows *Approved by ADM_CSE_001* |
| Click **"Give final approval — all N clean"** | documents become `verified` |
| Report line | names any applicant who is now fully verified |

### 5 — The signature chain

As SUP_001, open any verified document (**Verification** → click a name).
Scroll to **Approval chain** in the right column:

```
University · approved     signature valid
TNTEU      · approved     signature valid
```

### 6 — Enrol

As ADM_CSE_001 → **Applicants** → a fully verified applicant → **Enrol**.
A student account and a one-time password are created.

---

## C. Things that must FAIL (the important half)

Run each and confirm it is refused.

| Attempt | Expected result |
|---|---|
| TNTEU approves before the university has | `409` — "at the University review stage" |
| University re-approves a document it already forwarded | `409` — "with TNTEU now" |
| Bulk-approve a flagged document | held back, reason listed, still `pending` |
| Another university bulk-approves your documents | `0 decided` |
| Faculty or student opens `/api/admissions/queue` | `403` |
| Reject with a 2-character reason | `400` |
| Applicant uploads a QR pointing at a non-existent certificate | `422` at upload |
| Applicant uploads a degree certificate into the 10th-marksheet slot | `422` at upload |
| Applicant uploads a file another applicant already submitted | `422` at upload |

### Tamper test (proves the at-approval re-hash)

```bash
cd apps/api
# 1. As the university, approve a clean document so it sits at the TNTEU stage.
# 2. Overwrite its ciphertext on disk:
node -e "
require('dotenv/config');
(async()=>{
  const {default:c}=await import('./src/config/db.js'); await c();
  const {DocumentSubmission}=await import('./src/models/index.js');
  const d=await DocumentSubmission.findOne({reviewStage:'tnteu'}).lean();
  require('fs').appendFileSync('secure-storage/admission-docs/'+d.filePath,'X');
  console.log('tampered:',d._id); process.exit(0);
})()"
# 3. As SUP_001, try to approve it.
```

Expected: `409` — *"The stored file does not match the hash recorded when it was
uploaded"*. The document is permanently flagged `integrity_failed` and can never
be bulk-approved again.

---

## Quick API reference

| Method | Route | Who |
|---|---|---|
| `GET` | `/api/admissions/queue` | both — returns only your own stage |
| `POST` | `/api/admissions/queue/bulk` | both — `{decision, documentIds[]}` or `{decision:"approve", scope:"all_eligible"}` |
| `PATCH` | `/api/admissions/documents/:id/verify` | both — individual, at your stage |
| `PATCH` | `/api/admissions/documents/:id/reject` | both — needs `{reason}` |
| `GET` | `/api/admissions/documents/:id` | includes `assessment` + `approvalChain` |

Bulk response shape:

```json
{
  "stage": "college",
  "decidedCount": 30,
  "skippedCount": 5,
  "decided": [{ "outcome": "forwarded", "documentId": "...", "applicantId": "..." }],
  "skipped": [{ "documentId": "...", "reasons": ["Identical file already submitted..."] }],
  "applicantsNowVerified": []
}
```
