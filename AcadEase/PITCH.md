# AcadEase — the pitch

**Team SafeCircle** · Meera · Niranjana · Mayurika · Monisha · Sri Krishna College of Engineering and Technology, Coimbatore

> Every claim in this document points at a file. Anything not yet built is in
> [§7 What's next](#7-whats-next), separately and explicitly.

---

## 1. The problem, as the jury redefined it

TNTEU — Tamil Nadu Teachers Education University — is an **affiliating**
university. It does not teach. It oversees **640 affiliated B.Ed and M.Ed
colleges**, and it is the super-admin of the entire system.

When students apply for admission, the colleges submit their application
documents to TNTEU. TNTEU's teaching staff then **cross-verify every document,
one at a time, by hand**: is this the applicant's own 10th marksheet, does the
name match, is the community certificate still valid, has this file been seen
before.

At one college that is tedious. Across 640 colleges' worth of applicants it does
not finish. Teaching staff are pulled off teaching to do clerical
cross-checking, and the intake window closes before the backlog does.

**That manual cross-verification labour is the bottleneck we were asked to
solve** — not digitisation in general. Colleges already have computers. The
paper already arrives as PDFs. What does not scale is the human being who has to
open each one and compare it against a record.

---

## 2. Our solution — the verification flow

We did not try to remove the human. We tried to remove everything the human
should not have been doing in the first place: opening files that are fine,
transcribing fields, and hunting for the problem ones.

### Bulk submission

A college uploads one applicant CSV and a folder of document files named
`<applicantId>__<documentType>.pdf`. The server matches each file to its
applicant, encrypts it, hashes it and files it.

`apps/api/src/controllers/admissionController.js` → `importApplicants`,
`uploadDocuments` · UI: `apps/web/src/pages/admin/AdmissionsUpload.jsx`

### Deterministic flag detection, at upload time

Every document is put through a fixed set of rule-based checks. Nine flags,
all defined in one place — `apps/api/src/utils/admissionRules.js` → `FLAG_LABELS`:

| Flag | What it catches |
| --- | --- |
| `duplicate_hash` | The exact same file was already submitted for a **different applicant** — SHA-256 match, system-wide |
| `duplicate_resubmit` | Same file filed twice for the same applicant under two document types |
| `name_mismatch` | The name on the document does not match the applicant record |
| `missing_field` | An expected field (register number, date of issue) is not present |
| `expired_document` | The document's validity date has passed |
| `future_date` | The document is dated in the future |
| `unreadable` | No machine-readable text — a photo, so a human must read it directly |
| `type_unconfirmed` | This may not be the document type it was filed under |
| `cross_document_mismatch` | Details disagree with another document from the same applicant |

None of these approve or reject anything. They **reorder the queue** so the
reviewer sees the questionable documents first, and they pre-fill the extracted
fields so the reviewer *confirms* rather than *transcribes*.

### A queue instead of a pile — reviewed in two stages

The queue is sorted flagged-first, then oldest-first, and it is backed by an
index built for exactly that sort
(`apps/api/src/models/DocumentSubmission.js`).

Review happens in two stages, and the same two screens serve both — which
documents you see, and whether the buttons are live, is decided by the server
from your role, never by the route:

1. **The college** approves its own applicants' documents first. It stands
   behind them before TNTEU ever sees them.
2. **TNTEU** counter-approves. Only a TNTEU approval can set a document to
   `verified`.

`getVerificationQueue`, `applyDecision` in `admissionController.js` ·
UI: `apps/web/src/pages/admin/VerificationQueue.jsx`

### Bulk approval, with a gate

The reviewer can select documents and approve them together, or sweep every
eligible document in the queue at once —
`POST /api/admissions/queue/bulk` → `bulkDecide`.

The gate is the point: **a flagged document cannot be bulk-approved.** It must
be opened and decided individually. The bulk path also re-hashes every stored
file and re-checks for duplicates *at approval time*, so a file swapped after
upload fails the sweep rather than riding through it.

Rejections can never be swept — they must name the documents and carry a reason,
which is recorded against every one of them and signed.

**The net effect:** clean documents stop consuming reviewer attention, and the
reviewer's whole day goes to the ones the checks could not clear. Per-document
handling drops from *read and compare* to *glance and confirm*, and the flagged
minority is what a human actually spends time on.

---

## 3. Why we didn't use AI to approve documents

An LLM asked "is this marksheet genuine?" will answer confidently either way.
When it is wrong, a real student loses a real admission — or a forged document
is admitted with a machine's endorsement on it. There is no way to audit that
decision after the fact, no way to reproduce it, and no way to tell a rejected
applicant *why*. Worse, the same model on the same document can answer
differently next month.

**Every check in AcadEase is deterministic.** A SHA-256 hash comparison. A
string match between the name on the document and the name on the record. A date
comparison. A required-document checklist. Each one is a few lines in
`apps/api/src/utils/admissionRules.js`, each returns the same answer every time
for the same input, and each can be explained to the applicant in one sentence.

Where we use extraction (OCR / PDF text) we treat it as **input to a human, not
a verdict** — if the text cannot be read, the document is flagged `unreadable`
and routed to a person, never guessed at. `type_unconfirmed` behaves the same
way: uncertainty escalates, it never resolves itself.

No document is ever auto-approved. The system decides *what deserves attention*.
A human decides *what is true*. That is the line, and it is enforced in code:
the only paths that set a document to `verified` require an authenticated
reviewer's signature.

---

## 4. The unifying payoff — one platform, one lifecycle

Verification is the wedge. The reason it is worth building on one platform is
that the same student's record then flows through everything else, and
corrections propagate instead of rotting.

### The pieces that exist

**Results and assessments.** Faculty enter marks per assessment; semester
results are compiled, sent up for review, and published. Published results feed
the student's dashboard and results page directly.
`assessmentController.js` · `apps/web/src/pages/faculty/ResultEntry.jsx`

**Certificates.** A student requests one; their college approves it; **TNTEU
counter-signs it**; only then is the PDF generated, server-side. Each
certificate carries:
- an HMAC-SHA256 signature over its own identity fields,
- an **RSA-PSS counter-signature chain** — one link per approving institution,
  each signing over its own decision *plus the previous link's signature*, so a
  stage cannot be removed, reordered or edited without breaking every signature
  after it,
- a QR code pointing at a **public** verification URL.

`GET /api/certificates/verify/:certId` needs no login and returns the minimum:
name, type, issue date, institution, and which institutions signed. **No marks,
no attendance, no contact details.** Anyone can check a certificate; only a
private-key holder can make one — which is exactly why the chain is RSA and not
the HMAC alone.
`certificateController.js` · `utils/approvalChain.js` · `utils/keyring.js` ·
`apps/web/src/pages/verify/CertVerify.jsx`

An admin can revoke a certificate at any time
(`PATCH /api/certificates/:certId/revoke`).

**And the reverse direction:** staff have a *Verify Certificate* screen where a
certificate handed to them — a PDF, a photo, a scan — is dropped in and checked.
The QR is decoded, the record is verified against its signatures, and the
uploaded bytes are hashed against the PDF we generated. Those are two separate
verdicts on purpose: a forger can print a convincing certificate around a
genuine QR code, and only the file hash catches it. The screen then says
"genuine record, but this is not the file we issued — compare these details
against the paper in your hand".
`verifyCertificateUpload` in `certificateController.js` ·
UI: `apps/web/src/pages/faculty/CertificateVerify.jsx`

**Grievances.** A student raises one; faculty and the college office
acknowledge, then resolve or reject it, with the reason recorded; the student
rates the outcome. `grievanceController.js` ·
`apps/web/src/pages/student/Grievances.jsx`

### The connecting insight

Those three are usually three separate systems, and the seam between them is
where records go stale. A student disputes a mark. The college agrees and
corrects it. **The merit certificate already issued from that mark is now
wrong** — and in every system we looked at, either somebody has to remember to
regenerate it by hand, or the record is quietly edited and a signed PDF stays in
the world that no longer matches anything.

In AcadEase, **resolving a grievance that is tied to a corrected academic record
automatically revokes the affected certificate and issues a replacement** —
through the same signing path, not around it.

```
student disputes a published result
        │
        ▼
college corrects the record, resolves the grievance
with "the record was corrected" ticked
        │
        ▼
every ACTIVE certificate whose content derives from that record is:
   revoked  → status "revoked", revocationType "superseded"
   reissued → new certId, fresh HMAC, new QR,
              chain = the original approvals + a new signed "reissued" link
   linked   → old.supersededBy = new,  new.supersedes = old
```

`apps/api/src/utils/certificateReissue.js` ·
wired in `grievanceController.js` → `resolveGrievance`

Three properties make this safe rather than clever:

- **It is narrow, by design.** Only a grievance that *names the record it
  disputes* can trigger it, and only certificate types actually derived from
  that kind of record are touched — a corrected mark reissues `merit` and
  `completion`, and deliberately leaves `bonafide` and `character` alone,
  because those assert "this person is our student", which a mark does not
  change. A complaint about a broken projector can never touch a certificate.
  (`AFFECTED_BY` in `certificateReissue.js`.)
- **The admin sees the consequence before committing.**
  `GET /api/grievances/:id/certificate-impact` tells them exactly which
  certificates resolving it will supersede. And it only fires when they tick
  *"the record was corrected"* — "we checked and the mark was right" revokes
  nothing.
- **Nothing is ever edited or deleted.** The old certificate stays in the
  database with its original snapshot and signature intact. Its QR still
  resolves; scanning it now says *"superseded — a corrected certificate was
  issued"* and links to the replacement. It is visibly **not** the same thing as
  a certificate withdrawn for misconduct, which would be wrong to imply about a
  student whose mark the college itself got wrong.

**Why this answers the jury's ask directly:** it removes manual admin effort at
exactly the point where it is most likely to be forgotten — nobody has to
remember to regenerate a certificate after a revaluation — and it does so
without ever weakening the audit trail. The correction reuses the *same*
revoke-and-reissue mechanism that protects against forgery, so the fix is as
provable as the original.

Verified end to end by `apps/api/e2e-grievance-reissue.mjs` — 40 assertions,
including the negatives (a grievance naming no record, and a resolution that
explains rather than corrects, must both leave every certificate untouched) and
idempotence (resolving twice must not revoke the replacement).

### Also built, on the same spine

- **College Requests** — affiliation renewals, seat matrix revisions, new
  programmes, faculty recognition, exam centre designation. Typed requests with
  encrypted attachments, a two-way clarification thread, and a **digitally
  signed decision order** the college can show to anyone.
  `universityRequestController.js`
- **College-wise Analysis** — every affiliated college on one page: seat
  utilisation against its own sanctioned matrix, approval rates, average
  attendance, pending work. `analyticsController.js`
- **UMIS student register** — TNTEU can look up any student at any affiliated
  college without going through that college's office. Read-only, with **every
  file opened written to the audit log**. `umisController.js`
- **Circular distribution** — TNTEU issues a circular to any combination of
  students, faculty and admins across every affiliated college at once.

---

## 5. Architecture, briefly

**Stack.** React 18 + Vite + Tailwind (SPA) · Node 20 + Express 4 · MongoDB with
Mongoose · JWT access tokens held in memory with an httpOnly refresh cookie ·
TOTP 2FA mandatory for every staff role · RSA-PSS + HMAC-SHA256 for signing ·
AES envelope encryption for stored documents.

**Role hierarchy.**

| Role | Scope |
| --- | --- |
| `tnteu_admin` (super admin) | All 640 colleges. Final verification authority, counter-signs certificates, decides college requests, sees UMIS and college-wise analysis |
| `college_admin` | One college. Bulk-submits applicants, runs stage-one verification, raises requests to TNTEU, runs the college's academic modules |
| `college_coordinator` | One college, delegated oversight — same tenant boundary, narrower authority |
| `faculty` | Their department. Marks attendance, enters results, handles OD requests |
| `student` | Themselves only |

**The one architectural decision worth highlighting: tenant scope is enforced at
the query layer, not the UI.**

Every request carries a college scope derived from the token, and every
multi-tenant query is built through it rather than filtered afterwards —
`buildCollegeScope` / `applyCollegeScope` in `apps/api/src/middleware/auth.js`,
and the `scoped()` helper at the top of `admissionController.js` and
`universityRequestController.js`. A college admin's query for "all applicants"
is *rewritten* to "all applicants at my college" before it reaches MongoDB.

This is why one university can never see another's data even if it guesses an
ID: the record is not hidden from the response, it is **absent from the result
set**. A direct fetch of another college's request returns 404, not 403 — we do
not confirm the record exists. TNTEU is the only role whose scope resolves to
`{}`. Enforced by `apps/api/test/tenantScope.test.js` and asserted again in the
e2e scripts.

---

## 6. Demo script

Two terminals: `cd apps/api && npm run dev`, `cd apps/web && npm run dev`.
Data prepared with `npm run seed`, `npm run seed:admissions`,
`npm run seed:governance`. All passwords `Demo@2025`. Staff logins prompt for
TOTP on first use — scan once with any authenticator app before the demo starts.

**0:00 — The scale (30s).** Log in as **SUP_001** (TNTEU). Land on **Analysis**.
Three affiliated colleges, each with a different seat utilisation, approval rate
and average attendance. *"This is the super-admin's view. At 640 colleges this
page is the job."*

**0:30 — Bulk submission (60s).** New tab, log in as **ADM_CSE_001** (Kongu
College of Education) → **Bulk Submission**. Upload
`apps/api/demo-data/applicants.csv`, then the whole `demo-data/documents/`
folder. Show the per-row import report: 7 applicants imported, 2 rows rejected
with reasons. *"One CSV, one folder. This is how 640 colleges submit."*

**1:30 — The flags (60s).** Go to **Verify Documents**. The queue is sorted
flagged-first. Open **APP_2025_003's 10th marksheet** — flagged
`duplicate_hash`: it is a byte-for-byte copy of APP_2025_001's marksheet.
*"SHA-256, not a guess. Same file, two applicants."* Show APP_2025_004
(`name_mismatch`) and APP_2025_006 (`expired_document`) in the list.

**2:30 — Bulk approve with the gate (45s).** Select all → **Approve all
eligible**. The clean documents clear in one action; the flagged ones are
**refused by the gate** and listed as needing individual review. *"This is the
whole thesis: the machine clears what is provably fine, the human gets the rest.
Nothing was auto-approved."* Approve APP_2025_001's set individually.

**3:15 — TNTEU counter-verifies (30s).** Back to the **SUP_001** tab →
**Verification**. The documents the college approved are now on TNTEU's desk —
stage two of the same chain. Approve them.

**3:45 — Certificate issued (45s).** Log in as **STU_2021_CS_001** →
**Certificates** → request a **merit** certificate. As ADM_CSE_001 approve it,
then as SUP_001 counter-sign it. The PDF is generated only after both
signatures. Download it, **scan the QR** — the public page shows *Certificate
Valid*, both institutional signatures, and no marks or personal data.

**4:30 — The payoff: grievance → reissue (75s).** As the student, raise a
grievance: category **Academic**, and in *"Which result is this about?"* pick
the semester the merit certificate was issued from. Subject: *"Databases mark
entered as 88 instead of 94."*

As **ADM_CSE_001** → **Grievances** → Acknowledge. The resolve panel now warns:
*"1 active certificate (merit) was issued from this record."* Tick **"the result
record was corrected"**, write the resolution note, **Resolve**.

Immediately: *"1 certificate superseded and reissued."*

**5:45 — Close on the proof (45s).** Scan the **old** QR again: *"Superseded — a
corrected certificate was issued"*, with a link to the replacement. Scan the
**new** one: valid, its own signature, and the approval chain still shows the
original college approval and TNTEU's counter-signature. As the student, the new
certificate is already in their list.

*"Nothing was edited. Nothing was deleted. The old certificate still answers,
and it tells you what replaced it. Nobody had to remember to do any of this."*

**Fallback if the network is down:** `cd apps/api && npm run e2e:reissue` runs
the whole grievance→reissue path headless and prints all 40 assertions.

The four-laptop version of this script, with the preflight checks and recovery
steps, is in [DEMO-GUIDE.md](./DEMO-GUIDE.md).

---

## 7. What's next

Not built. Listed here so nothing above is ambiguous.

- **Scale testing at 640 colleges.** The queue, indexes and aggregations are
  built for it and the tenant scoping is enforced per query, but the largest
  dataset we have run is 3 colleges, 153 students and 267 applicants. We have not
  load-tested it.
- **DigiLocker / state registry integration.** Today `duplicate_hash` proves two
  applicants submitted the same *file*; it cannot prove a marksheet matches what
  the issuing board actually recorded. `utils/tnDocuments.js` already generates
  the lookup handle (board, register number, year) for a reviewer to check
  manually — the automated round-trip against the issuer is the missing piece,
  and it is the single biggest step up in verification strength available.
- **Attendance-driven reissue.** The engine already understands
  `attendance`-derived certificates; only the `result` path has a UI today.
- **Reissue when faculty correct a mark directly**, without a grievance being
  raised at all.
- **Analytics over time.** Current figures are point-in-time; there is no
  trend or year-on-year comparison.
- **Native mobile app.** The web app is responsive; there is no native client.
- **Web Push.** In-app and SSE notifications work; VAPID push is stubbed
  (`subscribePush` in `miscController.js`).
