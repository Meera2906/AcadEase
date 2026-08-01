# AcadEase

AcadEase is a role-based academic management platform for students, faculty, and administrators. The current implementation includes attendance workflows, results, certificates, grievances, announcements, study materials, PYQ practice, TOTP-secured login, and a dedicated faculty dashboard.

TNTEU now operates as a multi-tenant academic platform: one read-only `college_coordinator` role is used for delegated oversight tasks because it keeps TNTEU-wide review responsibilities separate from the operational authority of a college admin while avoiding a half-built public results view.

---

## The three features we are building

TNTEU is a affiliating university: it does not teach students directly. Colleges
do. Everything TNTEU actually does is **paperwork arriving from somewhere else
that a human then has to check**. All three of our features attack the same
bottleneck at three different points in that pipeline.

### 1. Admission document verification at scale — *intake*

**The problem.** Colleges send TNTEU the admission proofs of every applicant.
TNTEU teaching staff cross-check each document by hand against a checklist.
That manual pass is the bottleneck, and it does not scale with intake.

**What we built.** A structured verification queue, sorted flagged-first.
Deterministic rule-based checks (duplicate file hash system-wide, missing
fields, name mismatch, lapsed dates) run at upload and tell the reviewer where
to look. OCR pre-fills the fields so they confirm rather than transcribe.
Applicants can also apply directly, with every check running in seconds while
they are still at their desk.

**The measurable claim.** Per-document review time falls from minutes to
seconds, because the reviewer stops reading and starts confirming.
**Nothing is auto-approved** — see *Why there is no AI approving documents*.

### 2. University ↔ TNTEU governance requests — *administration*

**The problem.** Affiliation renewals, seat matrix revisions, new programme
approvals, faculty recognition, exam centre designation. Today these move by
letter, email and follow-up phone call, with no shared view of what is pending
or how long it has been sitting there.

**What we built.** Colleges raise a typed request, attach encrypted supporting
documents, and submit. TNTEU works a single prioritised queue, can ask for
clarification in-thread, and approves or rejects with a **digitally signed
order** the college can show to anyone. Turnaround time is measured, not
guessed.

### 3. Counter-signed certificates — *output*

**The problem.** A certificate is only worth what a stranger can check. And a
certificate that matters — a merit certificate — is authorised by two different
institutions, so it needs to carry proof of both.

**What we built.** A student requests → their university approves → TNTEU
counter-signs → the PDF is generated automatically and travels back down the
chain to the student. **Each stage adds its own RSA-PSS signature**, chained so
that removing, reordering or editing any stage invalidates everything after it.
Anyone can verify the whole chain by scanning the QR code, with no login.

|  | Intake | Administration | Output |
| --- | --- | --- | --- |
| Who initiates | Applicant / college | College | Student |
| Who decides | TNTEU reviewer | TNTEU | College, then TNTEU |
| What we removed | Manual cross-checking | Letters and phone calls | "Is this real?" |
| Proof it works | 49 + 59 e2e assertions | 21 e2e assertions | 39 e2e assertions |

---

## The problem this solves

Universities affiliated to TNTEU send admission proofs — marksheets, transfer
certificates, community certificates, ID — to TNTEU for approval. Today TNTEU
teaching staff cross-check every one of those documents by hand against a
checklist. That manual pass is the bottleneck, and it does not scale with intake.

AcadEase attacks the bottleneck with **structure, not judgement**. The reviewer
stays in the loop on every single decision; what changes is how long each
decision takes.

### Why there is no AI approving documents

An LLM deciding "this document is valid" is a hallucination risk with a real
victim — a wrongly rejected applicant loses their admission, a wrongly approved
one gets in on a forged marksheet. So nothing in this pipeline approves or
rejects anything. Two assistive mechanisms sit *around* the human instead:

| Mechanism | What it does | What it never does |
| --- | --- | --- |
| **Field pre-fill** (`utils/documentExtract.js`) | Reads the document's text layer and pattern-matches labelled fields so the reviewer sees a filled form instead of a blank one. | Decide anything. Every field is editable and a human confirms it before the document can be verified. |
| **Rule-based flags** (`utils/admissionRules.js`) | Deterministic comparisons: duplicate SHA-256 across the whole system, expected field absent, name on document vs. name on record, lapsed validity date. | Auto-reject. A flag only moves the document to the top of the queue. |

The labour reduction is the reviewer going from "read the whole document, look
things up, tick a checklist" to "glance at the flags, check the pre-filled fields
against the preview, click Verify" — seconds instead of minutes, per document.

### The verification workflow

There are two ways an application reaches TNTEU. Both land in the same queue.

**Route A — the applicant applies for themselves** (`/apply`)

0. A prospective student registers for a **temporary applicant account**. They
   are not a `User` and hold no student record — their token carries
   `typ: "applicant"`, which the staff/student auth guard rejects outright.
   They upload their own certificates and get an answer on each one within
   seconds:

   | Check | Refused outright | Flagged for the reviewer |
   | --- | --- | --- |
   | Legibility — pixel dimensions, effective DPI against A4, JPEG quantisation, blank pages, wrong file type | ✅ | low-DPI warnings |
   | QR resolves to one of our own certificates: missing record, broken signature, revoked, or issued to someone else | ✅ | — |
   | QR points at a recognised issuer portal | — | shown as a link the reviewer opens; **never** reported as verified |
   | The identical file already submitted by another applicant | ✅ | — |
   | Name mismatch, missing fields, lapsed dates | — | ✅ |

   A refusal explains exactly what to fix, so the applicant rescans while they
   are still at their desk instead of finding out weeks later.

1. When every required document is uploaded **and** the declared marks clear the
   programme's published minimum, they submit. Drafts never enter TNTEU's queue.

**Route B — the university submits on their behalf**

1. **University admin** bulk-submits a CSV of applicants plus a folder of
   document files. Every file goes through the same checks as Route A — a batch
   cannot be used to bypass them — and the admin gets a per-row report:
   succeeded / flagged / rejected, with reasons.
2. **TNTEU super admin** works a paginated queue sorted flagged-first. Opening a
   row gives a side-by-side view: the document on the left, its extracted and
   editable fields on the right, and any flags spelled out (e.g. *"this exact
   file was already submitted for applicant APP_2025_001"*). Two actions:
   Verify, or Reject with a written reason.
3. **Verifying one document does not verify the applicant.** An applicant flips
   to `verified` only when every required document for their programme is
   individually verified. The checklist state ("3 of 5 required documents
   verified") is visible everywhere the applicant appears.
4. Once verified **and** eligible, the university **enrols** the applicant. Only
   then does a student account exist. The temporary applicant password is
   destroyed at that moment and its token stops working — from then on they sign
   in on the main login page and download their digitally signed certificates
   from their own device whenever they need them.

### What a QR code can and cannot prove

This is the part most easily overclaimed, so it is worth being precise.

- If the QR resolves to a certificate **AcadEase itself issued**, we can settle
  the question completely: the record must exist, its HMAC signature must match,
  it must not be revoked, and it must be in the applicant's name. Failing any of
  those is proof the document is bad, and the upload is refused on the spot.
- If the QR points at a **third-party issuer** (a state board, a university), we
  can confirm the QR is well-formed and where it leads — nothing more. It is
  shown to the reviewer as a one-click link, and is *never* rendered as
  "verified", because we did not verify it. Silently upgrading a link into a
  green tick would be exactly the hallucination risk this design avoids, just
  wearing a security badge.
- **No QR is not a red flag.** Most Indian certificates in circulation predate
  QR codes. Flagging their absence would flag nearly every document and make the
  flagged-first queue ordering meaningless.

### Counter-signatures: why not the HMAC we already had

The original certificate code signed with an HMAC. An HMAC is **symmetric** —
the same secret both creates and checks it. Every party able to verify a
certificate could equally well mint a fake one, and the "authorised signatory"
line meant nothing beyond "somebody with database access wrote it".

The approval chain uses **RSA-PSS-SHA256** with one key pair per institution
(`tnteu`, plus one per college). Only the holder of a private key can produce
its signature; anyone at all — including a stranger scanning a QR code with no
login — can verify it. That asymmetry is what "non-spoofable" actually requires.

Each link signs over its own facts **plus the signature of the link before it**:

```
link 0  university  signs { subject, stage, decision, actor, remarks, time, previous: "genesis" }
link 1  TNTEU       signs { …, previous: <link 0 signature> }
link 2  TNTEU       signs { subject: the issued certificate, …, previous: <link 1 signature> }
```

So a rejection reason cannot be rewritten, an approval cannot be back-dated, a
stage cannot be removed or reordered, a college cannot manufacture TNTEU's
counter-signature, and a signature cannot be lifted onto a different record.
Each of those is a test in `test/approvalChain.test.js`.

One consequence worth knowing: if an institution's private key is lost, the
system **refuses to silently generate a replacement**, because doing so would
rotate the key out from under every signature ever issued with it — every
historical certificate would start reporting itself as forged. It fails loudly
and tells you to restore from backup.

### Encryption at rest

Admission proofs are identity documents — they carry names, dates of birth,
register numbers and Aadhaar numbers, sitting on a server that faculty and
students also log in to. So the plaintext never touches the disk:

1. Each file gets its own random AES-256-GCM data key.
2. Only the ciphertext is written.
3. That data key is wrapped (RSA-3072, OAEP-SHA256) **twice**: once for TNTEU
   and once for the university that owns the applicant.
4. Reading a document requires unwrapping one of those two keys. A student, a
   faculty account, an applicant, or a different university has no wrapped copy
   at all — there is no key path for them, not merely a missing permission
   check. GCM's auth tag means a file tampered with on disk throws instead of
   rendering.

Private keys are PKCS#8, encrypted at rest with `DOC_KEY_PASSPHRASE`. Losing
that passphrase makes every stored admission proof permanently unreadable.

### Eligibility

`utils/eligibility.js` expresses TNTEU's published admission norms as
arithmetic — B.Ed needs 50% in the UG degree (45% for SC/ST/BC/MBC), M.Ed needs
50% in the B.Ed. Given the same marks and category it always returns the same
answer and names the rule that failed. It gates submission *and* enrolment, and
is re-evaluated at enrolment rather than trusted from storage.

### Bulk-data and security guarantees

- Every applicant, document, batch and statistic query is scoped by
  `collegeId` **in the query itself** for university admins — never by filtering
  results after the fact.
- Admission proofs are stored in `apps/api/secure-storage/`, outside the
  statically served directory. The only way to read one is the authorised,
  scope-checked stream endpoint; filenames are server-generated UUIDs and the
  resolved path is re-checked against the document root on every read.
- Uploads are validated server-side for extension, MIME type (PDF/JPG/PNG),
  size (10 MB) and count (40 per request).
- Every document is SHA-256 hashed at upload. That hash is the primary
  fraud signal and it is cheap and deterministic.
- Every verify, reject, import and enrolment writes an audit row: who, when,
  which document, and the reason.
- Queue, applicant and batch listings are paginated server-side. Dashboard
  figures (throughput, average time-to-verify, per-university backlog) are
  computed with MongoDB aggregation, never by loading documents into memory.

---

## What is implemented now

### Authentication and access
- Role-based login for student, faculty, admin, and superadmin users
- JWT access + refresh flow with cookie-based refresh handling
- TOTP 2FA setup and verification for faculty/admin accounts
- Protected routes with role-aware redirects
- Login now lands faculty users on the faculty dashboard

### Student experience
- Student dashboard with attendance overview, streak indicators, XP summary, and quick actions
- Subject-wise attendance tracking with warning states
- Attendance schedule view for the current day
- Assessment and marks overview
- Result viewing flow
- Certificate request flow with status tracking
- Grievance submission and tracking
- OD request submission with optional document upload
- In-app notifications and announcement feed
- Profile management with resume upload and personal details
- Study material browsing and download/preview
- TET preparation resources and academic module support
- PYQ practice flow using PDF upload and quiz-style question extraction

### Faculty experience
- Faculty dashboard with quick actions and learning-resource summaries
- Attendance marking workflow
- Results entry and marks submission flow
- OD request review and approval workflow
- Announcement creation and broadcasting
- Student profile viewing for support and review
- Study material upload for academic and TET modules
- Upload support for syllabus, guides, notes, quizzes, papers, videos, and textbooks
- PDF preview/download for uploaded learning content
- Floating note pad with text note capture and downloadable export
- Built-in calculator for TET prep sessions

### Admin and superadmin experience
- Admin dashboard with attendance, pending actions, and recent activity summaries
- User management for students and faculty
- Department management
- Course management
- Certificate approval flow
- Grievance review and resolution workflow
- Announcement management
- Attendance and marks reporting views
- Study material management and content uploads
- Public certificate verification page

### Study materials and exam prep
- Upload materials with title, description, module type, subject, audience, and content type
- Support for text materials, syllabus, guides, notes, quizzes, papers, videos, and textbook references
- PDF preview and file download
- Quick-link section for syllabus and guide material
- PYQ practice panel that extracts questions from uploaded PDFs and runs a timed quiz experience

### Platform capabilities
- MongoDB + Mongoose data models for students, faculty, departments, courses, attendance, OD requests, assessments, marks, results, certificates, grievances, notifications, XP, announcements, and study materials
- File upload handling with Multer
- PDF parsing for uploaded materials and PYQ practice input
- Result PDF generation and certificate generation utilities
- Email, SMS, and in-app notification hooks
- Security headers, rate limiting, and CORS protection

---

## Tech stack

- Frontend: React, Vite, Tailwind CSS, React Router, Axios, Lucide icons
- Backend: Node.js, Express.js (ESM)
- Database: MongoDB with Mongoose
- Auth: JWT, bcrypt, otplib/TOTP
- File handling: Multer
- PDF handling: pdf-parse and PDF generation utilities
- Notifications: in-app notification flow with optional email/SMS integrations

---

## Project structure

```text
AcadEase/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── controllers/
│   │       ├── middleware/
│   │       ├── models/
│   │       ├── routes/
│   │       ├── seed/
│   │       └── utils/
│   └── web/
│       └── src/
│           ├── api/
│           ├── components/
│           ├── context/
│           ├── pages/
│           └── routes/
```

---

## Getting started

### Prerequisites
- Node.js 18+
- MongoDB instance

### 1. Install dependencies
```bash
cd apps/api && npm install
cd ../web && npm install
```

### 2. Configure environment variables
Create the API and web environment files as needed with your MongoDB URI, JWT secrets, and frontend/base URLs.

### 3. Seed demo data
```bash
cd apps/api
npm run seed              # colleges, users, attendance, results, certificates
npm run seed:admissions   # admission demo package + a second university admin
```

`seed:admissions` writes `apps/api/demo-data/` — an applicant CSV and 35
document PDFs, several of them deliberately flawed so the flags fire. Nothing
is inserted into the database by that script: you upload the package through
the UI, so the demo exercises the real import, hashing and flagging path. See
`demo-data/README.md` for the table of planted issues.

### 4. Start the app
```bash
# API
cd apps/api && npm run dev

# Web
cd apps/web && npm run dev
```

Then open http://localhost:5173

---

## Demo accounts

Use the password: Demo@2025

- Student: STU_2021_CS_001
- Faculty: FAC_CSE_001
- University admin (Kongu College of Education): ADM_CSE_001
- University admin (Sankara Teacher Training College): ADM_0912_001
- TNTEU super admin: SUP_001

Two university admins are seeded so the tenant boundary is demonstrable: log in
as `ADM_0912_001` after submitting a batch as `ADM_CSE_001` and the applicant
list is empty.

---

## Demo path A — a student applies for themselves (2 minutes)

1. Open **`/apply`** (linked from the bottom of the login page). Register with
   any email, pick B.Ed and a university, category **BC**.
2. On the documents page, try uploading a phone screenshot or a small cropped
   image first — it is **refused instantly** with the pixel dimensions and the
   DPI it needs instead.
3. Upload the five required certificates. Any file already used by another
   applicant is refused as a duplicate.
4. Enter marks with a UG percentage of **43** — the eligibility panel shows the
   45% reserved-category shortfall and the Submit button stays disabled. Raise
   it to 47 and it unlocks.
5. Submit → the documents enter TNTEU's queue. Nothing was in the queue while
   the application was still a draft.

## Demo path B — the university bulk-submits (5 minutes)

1. **ADM_CSE_001** → *Bulk Submission* → upload `demo-data/applicants.csv`
   (7 imported, 2 rows rejected with reasons), then all 35 files from
   `demo-data/documents/` (35 stored, 5 flagged).
2. **SUP_001** → *Verification* → the five flawed documents are already at the
   top of the queue. Open APP_2025_003's 10th marksheet: a red banner names
   APP_2025_001 as the applicant the identical file was already submitted for.
3. Open APP_2025_004's transfer certificate → reject it with a reason → the
   applicant drops to `rejected` and the university is notified.
4. Verify APP_2025_001's five required documents one by one. The checklist
   counts up 1/5 … 4/5 with the applicant staying `under_review`, and only flips
   to `verified` on the fifth.
5. **ADM_CSE_001** → *Applicants* → *Enrol* APP_2025_001 → a student account and
   one-time password are issued.
6. Log in as that student → *Admission* shows 5/5 verified → *Certificates* →
   download the signed PDF and scan its QR against the public verify page.

Both flows have automated end-to-end runs against a real database and a real
HTTP server:

| Script | Covers | Assertions |
| --- | --- | --- |
| `apps/api/e2e-admissions.mjs` | Bulk import report, flag detection, tenant isolation, queue ordering, the checklist gate, rejection reasons, the enrolment gate, DB-layer aggregation, audit trail | 49 |
| `apps/api/e2e-preadmission.mjs` | Applicant registration and token isolation, every instant check, QR authenticity across 8 cases, encryption at rest and who can decrypt, tamper detection, the eligibility gate, drafts staying out of the queue, handover to a student account | 59 |
| `apps/api/e2e-signedflow.mjs` | University→TNTEU requests (drafts, clarification thread, signed orders, tenant isolation) and the counter-signed merit certificate chain (merit threshold, stage ordering, both signatures, auto-generation, public verification, tamper detection) | 60 |

Both are **destructive** — they reset the demo applicants and their documents,
so point them at a dev database only. `npm test` runs the 34 unit tests, which
are non-destructive and need no database.

Deliberate demo detail: **APP_2025_005** in the bulk package has a UG
percentage of 43.5% at the BC rate, so even after documents are verified they
are blocked at enrolment by the eligibility gate.

## Demo path C — university applies to TNTEU (2 minutes)

1. **ADM_CSE_001** → *TNTEU Requests* → *New request* → "Seat matrix revision",
   describe the ask → creates a **draft**. TNTEU cannot see drafts.
2. Attach a supporting document — it is encrypted on upload, and the row shows
   who holds a key to open it.
3. *Submit to TNTEU*.
4. **SUP_001** → *College Requests* → open it → *Ask for more* → the college
   sees the question in the thread and replies.
5. *Approve* with a note → a **signed order** is produced. Reload as the college:
   the decision panel shows the signature, the key fingerprint, and
   "Signature verified".

## Demo path D — counter-signed merit certificate (3 minutes)

1. Log in as a student with published results → *Certificates* → request a
   **merit** certificate. If they are under 75% or carrying arrears, the server
   refuses and says why.
2. The stage trail shows `Requested › University approval › TNTEU
   counter-signature › Issued`.
3. **ADM_CSE_001** → *Certificates* → the request is in "Awaiting your
   approval" → *Approve & send to TNTEU*. No certificate exists yet.
4. **SUP_001** → *Certificates* → now in "Awaiting your counter-signature" →
   *Counter-sign & issue*. The PDF is generated automatically, carrying a
   counter-signature block naming both institutions.
5. The student downloads it and scans the QR → the public verify page lists the
   full chain of authorisation with each signature independently re-checked.
6. To show it is real: edit one approval in the database and reload the verify
   page — it flips to *"the approval chain has been altered since it was
   issued"*.

---

## Key flows now covered

0. Bulk admission submission → flagged verification queue → human verify →
   enrolment → signed certificate download
1. Attendance marking and student attendance tracking
2. Result entry, review, and publication
3. OD request handling
4. Certificate requests and verification
5. Grievance submission and review
6. Announcements and in-app notifications
7. Study materials and TET prep resources
8. PYQ practice extraction and quiz workflow
9. Faculty dashboard entry and role-based navigation

---

## Notes

This README reflects the current implementation in the repository, including the faculty dashboard landing flow and the study-materials / PYQ experience that were added recently.
