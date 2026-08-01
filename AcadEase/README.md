# AcadEase

AcadEase is a role-based academic management platform for students, faculty, and administrators. The current implementation includes attendance workflows, results, certificates, grievances, announcements, study materials, PYQ practice, TOTP-secured login, and a dedicated faculty dashboard.

TNTEU now operates as a multi-tenant academic platform: one read-only `college_coordinator` role is used for delegated oversight tasks because it keeps TNTEU-wide review responsibilities separate from the operational authority of a college admin while avoiding a half-built public results view.

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

1. **University admin** bulk-submits a CSV of applicants plus a folder of
   document files. Every file is hashed and rule-checked on arrival, and the
   admin gets a per-row report — succeeded / flagged / rejected, with reasons.
2. **TNTEU super admin** works a paginated queue sorted flagged-first. Opening a
   row gives a side-by-side view: the document on the left, its extracted and
   editable fields on the right, and any flags spelled out (e.g. *"this exact
   file was already submitted for applicant APP_2025_001"*). Two actions:
   Verify, or Reject with a written reason.
3. **Verifying one document does not verify the applicant.** An applicant flips
   to `verified` only when every required document for their programme is
   individually verified. The checklist state ("3 of 5 required documents
   verified") is visible everywhere the applicant appears.
4. Once verified, the university **enrols** the applicant, which creates their
   student account. From there they log in from their own device and download
   their digitally signed certificate whenever they need it.

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

## The five-minute demo path

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

An automated run of this same flow — 49 assertions covering the import report,
flag detection, tenant isolation, queue ordering, the checklist gate, the
rejection-reason requirement, the enrolment gate, aggregation and the audit
trail — lives in `apps/api/e2e-admissions.mjs`.

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
