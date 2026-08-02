# AcadEase — demo guide

**Four laptops. Four roles. Ten minutes, demo and explanation together, live on
the deployed site.**

This is the only test-and-present document. It covers what each person does,
what to check before you walk in, the minute-by-minute run of show with the
words to say, what to do when something breaks, and the answers to the questions
you will be asked.

Fill these in first — everyone needs them:

```
WEB   https://________________.vercel.app
API   https://________________.onrender.com
```

- [Who sits where](#who-sits-where)
- [The day before](#the-day-before)
- [Twenty minutes before](#twenty-minutes-before)
- [Pre-staged state](#pre-staged-state)
- [The run of show](#the-run-of-show)
- [When something breaks](#when-something-breaks)
- [Questions you will be asked](#questions-you-will-be-asked)
- [Prove it on demand](#prove-it-on-demand)
- [After the demo](#after-the-demo)

---

## Who sits where

Every account is `Demo@2025`. One laptop per person, all four signed in
**before** the timer starts.

| | Laptop | Account | Plays | Owns these minutes |
|---|---|---|---|---|
| 🟣 | **L1** | `SUP_001` | **TNTEU** — the regulator, super admin over 640 colleges | 0:00, 3:30, 4:30, 7:40 |
| 🔵 | **L2** | `ADM_CSE_001` | **Kongu College of Education** — the college office | 0:40, 2:00, 4:50, 6:10 |
| 🟢 | **L3** | `FAC_CSE_001` | **Faculty** — the department that generates the records | 6:55 |
| 🟠 | **L4** | `STU_2021_CS_001` | **A student** at that college | 4:40, 5:30, 7:20 |

**L1 is the main screen.** If only one laptop is on the projector, it is this
one, and the others call out what they see. If you can mirror two, put **L1 and
L2** up — that pairing carries the whole first half.

**One person narrates throughout.** Whoever holds L1. The other three speak only
for their own beat, in one or two sentences. Four people narrating in ten
minutes is how a demo runs long.

---

## The day before

Work through this in order. It takes about 40 minutes the first time.

### 1. Deploy is live and current

Both Render and Vercel must be on the latest commit. See
[DEPLOYMENT.md](./DEPLOYMENT.md).

```bash
curl https://YOUR-API.onrender.com/health
```

Wanted:

```json
{ "status": "ok", "database": "connected", "signingKeyPinned": true }
```

`signingKeyPinned: false` means the next redeploy silently invalidates every
certificate already issued. Fix it before you seed anything —
[DEPLOYMENT.md §4](./DEPLOYMENT.md#4-pin-the-signing-keys).

### 2. Seed the production database

From any one laptop, pointed at the deployed database:

```bash
cd AcadEase/apps/api
MONGO_URI="<your Atlas URI>" npm run seed
MONGO_URI="<your Atlas URI>" npm run seed:governance
```

> Both wipe before they write. Only ever against the demo database.

`seed` creates the colleges, staff, students, attendance and published results.
`seed:governance` adds the other two colleges' students, 258 applicants, the 9
college requests and the circulars — without it the Analysis page has one
populated row and two empty ones.

### 3. Generate the upload package — **on L2**

```bash
cd AcadEase/apps/api
npm run seed:admissions
```

This writes `apps/api/demo-data/` locally: `applicants.csv` and 35 document
PDFs. It is git-ignored, so **it exists only on the machine that ran it.** L2 is
the laptop that uploads them, so run it there. Confirm:

```bash
ls apps/api/demo-data/documents | wc -l     # 35
```

### 4. Enrol 2FA on the three staff accounts

`SUP_001`, `ADM_CSE_001` and `FAC_CSE_001` all require TOTP, and seeding resets
it. The **first** sign-in shows a QR code — you do not want that happening on
the projector.

On each staff laptop, go to the Vercel URL, sign in, scan the QR with Google
Authenticator / Authy, enter the code. One phone can hold all three.

Then sign in a second time to confirm it asks for a code rather than showing a
QR again.

### 5. Clear the admission pipeline

```bash
MONGO_URI="<your Atlas URI>" npm run reset:admissions
```

The demo imports applicants live. If a previous run's applicants are still
there, every row is rejected as *"already submitted by your university"* — which
is correct behaviour, and a dead end on stage. **Run this after every rehearsal
and again on the morning.**

### 6. Full rehearsal

Run the whole [run of show](#the-run-of-show) once, end to end, with all four
laptops. Time it. Then reset (step 5) and do it again.

---

## Twenty minutes before

### The preflight — run this first

From any laptop with the repo:

```bash
cd AcadEase/apps/api
node scripts/demo-preflight.mjs --api https://YOUR-API.onrender.com --web https://YOUR-WEB.vercel.app
```

It signs in as the student only — no secrets, no staff credentials — and checks
the things that actually go wrong: the API is awake, CORS accepts your front
end, cross-site cookies carry `SameSite=None; Secure`, the CSRF path works, the
student has a published result and is merit-eligible, the seeded data is
present, and **whether each staff account has enrolled 2FA or is about to ambush
its presenter with a QR screen.**

You want `READY.` Anything else, read the line — each one names its own fix.

### Then, per laptop

| | Check |
|---|---|
| **All four** | Signed in, on the Vercel URL, sitting on the first screen of your beat. Browser zoom **125%** — judges are three metres away. Close every other tab. Notifications off. |
| **L1** | On **Analysis**. Second tab open on **College Requests**. Third tab open on **Circulars**. |
| **L2** | On **Bulk Submission**. `demo-data/` folder open in a file manager, ready to drag. Second tab on **Verify Documents**. |
| **L3** | On **Mark Attendance**, course **CS301 Database Management Systems** already selected. Second tab on **Verify Certificate**. |
| **L4** | On **Certificates**. Second tab on **Grievances**. |

### Keep the API awake

Render's free tier sleeps after 15 minutes idle and takes 30–60 seconds to wake
— which will look exactly like a crash. Leave a `/health` tab open and refresh
it every few minutes until you are called. Once anyone is signed in, the live
notification stream keeps it warm on its own.

---

## Pre-staged state

Ten minutes is not enough to build the certificate from nothing *and* show the
correction story. So one thing is staged in advance, and you say so — staging is
normal, pretending is not.

**Before the demo, do this on L4 and L2:**

1. **L4** → Certificates → request a **merit** certificate, purpose
   *"Scholarship application"*.
2. **L2** → Certificates → **approve** it.
3. Stop there. It is now sitting at *"awaiting TNTEU"*.

During the demo, L1 counter-signs it live — one click — and the PDF is generated
in front of the judges. You show the finish of the signing chain without
spending ninety seconds on its setup.

Everything else in the run is genuinely live.

---

## The run of show

**DO** is what you click. **SAY** is roughly what you say — your words, this
substance. Times are cumulative from zero.

---

### 0:00 – 0:40 · The problem 🟣 **L1**

**DO** — On **Analysis**. Point at the three college rows and the totals.

**SAY**
> TNTEU is an affiliating university. It doesn't teach anyone — it oversees 640
> B.Ed and M.Ed colleges, and it's the super admin of this whole system. When
> students apply, the colleges send their admission documents to TNTEU, and
> TNTEU's *teaching staff* cross-check every single one by hand. That's the
> bottleneck we were asked to solve. Not digitisation — the colleges already
> send PDFs. The person who has to open each one.
>
> This is what that looks like from the regulator's chair. Three colleges here;
> at 640 this page is the job.

---

### 0:40 – 2:00 · One CSV, one folder 🔵 **L2**

**DO** — **Bulk Submission** → upload `demo-data/applicants.csv` → **Import
applicants**. Then drag all 35 files from `demo-data/documents/` → **Upload
documents**.

**SAY**
> I'm the college office at Kongu College of Education. One CSV of applicants,
> one folder of their documents — the files are named
> `applicantId__documentType`, so the server matches each one to its applicant.

**DO** — Point at the import report: **7 imported, 2 rejected**.

**SAY**
> Two rows rejected, with the reason on each: one has an unsupported programme,
> one has no applicant ID. The college sees exactly what to fix — nobody emails
> back asking what went wrong.

*(The 35 documents take a few seconds to encrypt and hash. Talk over it: every
file is encrypted at rest and readable only by TNTEU and this college.)*

---

### 2:00 – 3:30 · The flags, and the gate 🔵 **L2** — *the core claim*

**DO** — **Verify Documents**. The queue is sorted flagged-first.

**SAY**
> 35 documents in. Five are flagged. The queue puts them at the top.

**DO** — Open **APP_2025_003's 10th marksheet** — flagged `duplicate_hash`.

**SAY**
> This is a byte-for-byte copy of another applicant's marksheet. SHA-256 — not a
> guess, not a model's opinion. It even names the applicant it matches.

**DO** — Back to the queue. Point at the other four: `name_mismatch` on
APP_2025_004's transfer certificate, `missing_field` on 005's 12th,
`unreadable` on 005's ID proof, `expired_document` on 006's community
certificate.

**SAY**
> Nine checks, all deterministic. A hash comparison. A name comparison. A date
> comparison. A required-document checklist. Every one gives the same answer
> every time, and every one can be explained to a rejected applicant in a
> sentence.
>
> **We deliberately did not put an LLM in this decision.** A model that says "this
> marksheet looks genuine" and is wrong costs a real student their admission,
> and you can't audit it, reproduce it, or tell them why. Where we do use text
> extraction, it's input to a human — if a document can't be read, it's flagged
> `unreadable` and routed to a person. Uncertainty escalates. It never resolves
> itself.

**DO** — Select all → **Approve all eligible**.

**SAY**
> Thirty clear in one action. And the five flagged ones are **refused** — the
> gate won't let them through in bulk. They have to be opened individually.
>
> That's the whole thesis. The machine clears what is provably fine, and hands
> the human the ones that need judgement. Nothing was auto-approved.

**DO** — Open APP_2025_001's set and approve it individually.

---

### 3:30 – 4:30 · Two stages, two institutions 🟣 **L1**

**DO** — **Verification**. The documents L2 just approved are now here.

**SAY**
> Now I'm TNTEU. What's on my desk is only what the college has already stood
> behind — stage one is theirs, stage two is mine. Before they approved, this
> queue was empty. A college can't approve on TNTEU's behalf, and TNTEU can't
> skip the college.

**DO** — **Approve all eligible**.

**SAY**
> Only a TNTEU approval can mark a document verified. And every approval
> re-hashes the stored file before it commits — swap a file after upload and the
> approval fails, not the audit.

---

### 4:30 – 5:30 · A certificate nobody can forge 🟣 **L1** → 🟠 **L4**

**DO — L1** — **Certificates** → the pending merit request → **Approve**.

**SAY (L1)**
> This student asked for a merit certificate, their college approved it, and
> it's been waiting for my counter-signature. Now the PDF gets generated —
> server-side, only after both signatures exist.

**DO — L4** — **Certificates** → refresh → download the certificate → **scan the
QR with a phone** (or open `/verify/<certId>`).

**SAY (L4)**
> Anyone can check this. No login.

**SAY (L1)** — pointing at the verification page
> It shows the name, the type, the date, and both institutional signatures. It
> shows **no marks, no attendance, no contact details** — an employer verifying a
> certificate has no business seeing any of that.
>
> Underneath, each institution signs its own decision *plus the signature before
> it*. Remove a stage, reorder them, or edit an approval, and every signature
> after it breaks. It's RSA, not a shared secret — anyone can verify, only the
> key holder can sign.

---

### 5:30 – 6:55 · The payoff 🟠 **L4** → 🔵 **L2** → 🟠 **L4**

This is the part to slow down for. Do not rush it.

**DO — L4** — **Grievances** → New → Category **Academic** → in *"Which result is
this about?"* pick **Semester 4 — 2023-2024** → Subject: *"Databases mark
entered as 88 instead of 94"* → Submit.

**SAY (L4)**
> I'm disputing a mark. Notice the form asked me *which result* — that link
> matters in a second.

**DO — L2** — **Grievances** → **Acknowledge**. Then stop and point at the
warning that appears.

**SAY (L2)**
> Here's the problem every one of these systems has. If I correct this mark, the
> merit certificate that was issued *from* that mark is now wrong — and it's a
> signed PDF that's already out in the world.
>
> The system is telling me before I act: **one active certificate was issued from
> this record.**

**DO — L2** — Tick **"the result record was corrected"**, write a resolution note
(*"Revaluation applied: CS302 corrected from 88 to 94"*), **Resolve**.

**SAY (L2)**
> Resolving with that ticked revokes the old certificate as **superseded** and
> issues a replacement — signed the same way, through the same path.

**DO — L4** — **scan the OLD QR again** (the phone still has it, or reopen the
old link).

**SAY (L4)**
> The old certificate still answers. It doesn't 404, and it doesn't say
> "revoked" — it says **superseded, a corrected certificate was issued**, and it
> links to the replacement. That distinction matters: this student did nothing
> wrong, the college did. A red "revoked" would imply misconduct.

**DO — L4** — Follow the link to the new certificate. Then **Certificates** → the
replacement is already in the list.

**SAY (L1, closing the beat)**
> Nothing was edited. Nothing was deleted. The old record keeps its original
> snapshot and its original signature, and the new one still carries the
> college's original approval in its chain.
>
> And nobody had to *remember* to do it. That's the point — this is exactly the
> manual admin step that gets forgotten, and when it's forgotten a wrong signed
> certificate stays valid.
>
> It only fires when the grievance names a record, and only for certificates
> actually derived from that record. A complaint about a broken projector can
> never touch anyone's certificate.

---

### 6:55 – 7:40 · The everyday layer is real 🟢 **L3** → 🟠 **L4**

**DO — L3** — **Mark Attendance** → CS301 → mark a few students, including
`STU_2021_CS_001` → Save.

**SAY (L3)**
> The records this all runs on come from here. I'm faculty — attendance, marks,
> results, OD requests. This isn't a separate system bolted on; it's the same
> student record the certificate was issued from.

**DO — L4** — **Attendance** → refresh → the session L3 just marked is there.

**SAY (L4)**
> Live, on my screen.

**DO — L3** — **Verify Certificate** → drop in the certificate PDF L4 downloaded
earlier.

**SAY (L3)**
> And the other direction. Somebody hands me a certificate — I drop the file in
> here. It reads the QR, checks the signatures, and hashes the file against the
> PDF we generated. Genuine record, and the original file.
>
> If someone had printed a convincing forgery around a real QR code, the record
> would still verify — and this second check is what catches it.

---

### 7:40 – 8:40 · The regulator's other half 🟣 **L1**

**DO** — **College Requests** → open the urgent Kongu one, *"Increase B.Ed
sanctioned intake from 100 to 150"*.

**SAY**
> Admissions aren't the only paper that reaches TNTEU. Seat matrix revisions,
> affiliation renewals, new programmes, faculty recognition, exam centres —
> today all of that moves by letter and follow-up phone call.

**DO** — **Approve** → point at the signed decision order with its key
fingerprint.

**SAY**
> The decision comes back digitally signed. The college has an order it can show
> to anyone, and anyone can check it.

**DO** — **Circulars** → New → title *"Evaluation demo circular"* → tick
**Students + Faculty + Admins** → Distribute.

**SAY**
> And one circular, to any combination of groups, across every affiliated
> college at once.

**DO** — All four laptops: point at the notification bell.

**SAY (L2, L3, L4 in turn — one word each)**
> Got it. · Got it. · Got it.

*(This is the moment the four-laptop setup earns itself. Make sure everyone is
watching their bell.)*

---

### 8:40 – 9:20 · Close 🟣 **L1**

**DO** — Back to **Analysis**.

**SAY**
> One more thing under all of it. Every query is scoped by college at the
> database layer, not filtered in the UI. When the college admin asked for "all
> applicants", the query was rewritten to "all applicants at *my* college" before
> it reached MongoDB. Ask for another college's record by ID and you get a 404,
> not a 403 — we don't even confirm it exists. TNTEU is the only role whose
> scope is everything.
>
> So: bulk submission, deterministic flags, a queue instead of a pile, bulk
> approval with a gate that a flagged document can't pass — and one student
> record underneath, where correcting a mark corrects the certificate that was
> built on it, automatically, without ever breaking the audit trail.

---

### 9:20 – 10:00 · Buffer

Do not plan to use this. It is for the step that runs long and the first
question.

---

## When something breaks

Stay on the clock. Every one of these has a way forward.

| What happens | Do this |
|---|---|
| **First click hangs 30–60s** | Render was asleep. Keep talking — the problem framing covers it. It only happens once. |
| **CSV imports 0 of 7** | The pipeline wasn't reset. The screen now explains this itself. Say *"already submitted — the system refuses to let a college silently overwrite applicants"*, and move straight to the document upload, which still works. |
| **All 35 documents flagged** | Same cause. Same recovery — and it is still demoable: 29 remain bulk-approvable. |
| **A staff laptop shows a QR code** | 2FA was never enrolled. That laptop scans it now, silently, while another beat runs. Don't narrate it. |
| **"CSRF token missing or invalid"** | The deployed build predates the fix. Redeploy **both** Render and Vercel. Nothing else will make it go away. |
| **Someone gets logged out** | Sign back in. If it repeats, `COOKIE_CROSS_SITE=true` is missing on Render. |
| **Too many failed attempts** | Rate limit, shared WiFi. Wait 60s. Only failed logins count, so it means someone is mistyping. |
| **Certificate downloads 404** | The PDF was on ephemeral storage and a redeploy wiped it. **Verification by QR still works** — show that instead, it is the stronger artefact anyway. |
| **The reissue doesn't fire** | The grievance didn't name a result (was it **Academic**, with a result picked?), or the box wasn't ticked. Raise it again correctly — 40 seconds. |
| **The whole site is down** | Fall back to the terminal: `npm run e2e:reissue` runs the entire payoff headless and prints 40 assertions. Have it ready in a tab. |

---

## Questions you will be asked

**"Why not use AI to verify the documents?"**
> Because an LLM that says a marksheet is genuine and is wrong costs a real
> student their admission, and there's no way to audit, reproduce or explain
> that decision. Every check here is a hash comparison, a string comparison, a
> date comparison or a checklist. Same input, same answer, every time. Where we
> extract text, it's a pre-fill for a human — unreadable documents get flagged
> and routed to a person, never guessed at.

**"So the machine never approves anything?"**
> Correct. It decides what deserves attention. A human decides what's true. The
> only code paths that mark a document verified require an authenticated
> reviewer's signature.

**"Where did the mark actually get corrected?"**
> Faculty re-enter and republish the result — that's the college's own process.
> What we built is the consequence: the admin confirms the record was corrected
> when they resolve the grievance, and the certificate reissue is automatic from
> there. We're not claiming to have automated the revaluation. We've automated
> the thing everyone forgets afterwards.

**"What if the college lies and ticks the box without correcting anything?"**
> Then they've issued themselves a fresh certificate with identical content and
> left a signed audit entry saying they did it. It's recorded against the
> grievance, the audit log, and both certificates. It isn't a way to hide
> anything.

**"Does this scale to 640 colleges?"**
> The queue, the indexes and the aggregations are built for it, and tenant
> scoping is per query rather than per response — so it doesn't degrade as
> colleges are added. Honestly: the largest dataset we've run is 3 colleges, 153
> students, 267 applicants. We haven't load-tested 640.

**"What stops one college seeing another's applicants?"**
> The query is rewritten before it reaches the database, so the record is absent
> from the result set rather than filtered out of the response. Direct fetch by
> ID gives a 404. We can show you — 20 seconds. *(See below.)*

**"Can a certificate be faked?"**
> You'd need TNTEU's private key. Verification is public, signing is not — that's
> why the chain is RSA rather than the HMAC we started with. With a shared
> secret, anyone who can check a certificate can mint one.

**"What happens to the old certificate — is it deleted?"**
> Never. It stays with its original snapshot and signature, marked superseded,
> and it keeps answering its QR. That's deliberate: an employer who checked it
> last year and writes down the ID must still get a truthful answer.

**"What's not built yet?"**
> DigiLocker or state-registry integration is the big one. Today we can prove two
> applicants submitted the same file; we can't prove a marksheet matches what the
> board actually recorded. We already generate the lookup handle for a reviewer
> to check by hand — the automated round-trip is the missing piece, and it's the
> single biggest jump in verification strength available to us.
> [PITCH.md §7](./PITCH.md#7-whats-next) has the full list.

---

## Prove it on demand

Short, live answers if a judge pushes. Rehearse these two.

**Tenant isolation — 20 seconds.** Keep a browser profile pre-signed-in as
`ADM_0912_001` (Sankara Teacher Training College) on L3. Open **Applicants** —
not one Kongu applicant. Paste a Kongu applicant's URL — **404**.

**The public page leaks nothing — 15 seconds.** On the certificate verification
page, open the browser's network tab and show the response body: name, type,
date, institution, signatures. No marks. No attendance. No contact details.

**A forged file — 30 seconds.** On L3's **Verify Certificate**, upload any PDF
that is not a certificate: it reports that no certificate reference could be
read, and offers the paste-the-ID fallback. Upload a *superseded* certificate
and it reports the supersession and links to the replacement.

**These must fail, and do:**

| Attempt | Result |
|---|---|
| TNTEU approves before the college has | `409` — still at the university stage |
| The college re-approves what it already forwarded | `409` — with TNTEU now |
| Bulk-approve a flagged document | held back, reason listed, still pending |
| Another college bulk-approves your documents | `0 decided` |
| A student or faculty opens the verification queue | `403` |
| Reject with a two-character reason | `400` |
| Upload a degree certificate into the 10th-marksheet slot | `422` at upload |
| Edit a stored file after upload, then approve it | `409` — the at-approval re-hash catches it, and the document is permanently marked `integrity_failed` |

**Automated backup — anytime.** These run headless and print every assertion:

```bash
cd AcadEase/apps/api
npm test                # 80 unit tests, no database
npm run e2e:reissue     # the grievance → certificate reissue payoff, 40 assertions
npm run e2e:certverify  # verifying a certificate file, 29 assertions
npm run e2e             # all five suites
```

---

## After the demo

```bash
cd AcadEase/apps/api
MONGO_URI="<your Atlas URI>" npm run reset:admissions
```

Clears the applicants, their documents and the encrypted files, so the next run
starts clean. Colleges, logins and everything else are untouched.

If you also want the certificate story reset, delete the merit certificate and
its grievance for `STU_2021_CS_001`, then re-stage
[the pre-staged state](#pre-staged-state).
