# AcadEase — Architecture &amp; Build Status

This doc exists so that whoever (or whichever AI tool — Antigravity,
Claude, Copilot) picks this repo up next knows exactly what's real, what's
a stub, and what to build next **without re-reading the whole PRD**. It
maps directly to the priority tiers in `AcadEase_PRD.docx` Section 4.

---

## 1. Status legend

- ✅ **Done** — real Mongoose logic / real React UI, works against seeded data
- 🟡 **Backend done, frontend stub** — API route fully implemented; the
  screen is a `PlaceholderPage` telling you which endpoint to wire up
- ⬜ **Not started** — route exists as a documented gap, or is P3 (roadmap-only)

---

## 2. Backend — `apps/api/src`

| Area | File(s) | Status |
|---|---|---|
| DB connection | `config/db.js` | ✅ |
| Models (all 14 collections from PRD §6) | `models/*.js` | ✅ |
| JWT (access + refresh, role-based expiry) | `utils/jwt.js` | ✅ |
| TOTP 2FA (faculty/admin/superadmin) | `utils/totp.js` | ✅ |
| Certificate PDF + QR + HMAC anti-spoofing | `utils/certificate.js` | ✅ |
| Notification pipeline (in-app) | `utils/notify.js` | ✅ in-app · ⬜ Web Push / email wiring (VAPID + Nodemailer creds needed) |
| Auth routes (login, TOTP, refresh, logout, password reset) | `routes/authRoutes.js` | ✅ |
| Attendance (mark, summary, analytics, OD flow) | `routes/attendanceRoutes.js` | ✅ — **this is the demo centrepiece**, fully wired including the absent-notification trigger |
| Assessments, marks, leaderboard, results | `routes/assessmentRoutes.js` | ✅ |
| Certificates (request → approve → PDF/QR → verify → revoke) | `routes/certificateRoutes.js` | ✅ |
| Grievances | `routes/grievanceRoutes.js` | ✅ (basic MVP scope per PRD §5.5 — no SLA/escalation, that's Phase 2) |
| Notifications, users, admin dashboard, gamification XP | `routes/miscRoutes.js` | ✅ core logic · ⬜ `bulk-import` is a documented 501 stub (needs multer + CSV parsing) |
| **Admission verification** (bulk import → hash + rule flags → TNTEU queue → verify/reject → enrol) | `routes/admissionRoutes.js`, `controllers/admissionController.js` | ✅ — **this is now the demo centrepiece** |
| Admission rules (required-document checklist, deterministic flags, derived applicant status) | `utils/admissionRules.js` | ✅ unit-tested in `test/admissionRules.test.js` |
| Assistive field pre-fill from document text | `utils/documentExtract.js`, `utils/pdfText.js` | ✅ — pattern-matching only, never a decision |
| CSV reader (quoted fields, per-row line numbers) | `utils/csv.js` | ✅ |
| Seed script | `seed/seed.js` | ✅ matches PRD §9 exactly |
| Admission demo package generator | `seed/seedAdmissions.js` | ✅ writes `demo-data/` with planted flaws |
| End-to-end flow check (49 assertions, real Mongo + HTTP) | `e2e-admissions.mjs` | ✅ |

### Admission verification — design notes

- **`pdf-parse` is deliberately not used on this path.** Its bundled pdf.js
  accumulates state and starts throwing `bad XRef entry` on valid files after
  roughly eight parses in one process — a 40-file bulk upload would silently
  mark most of the batch `unreadable` and push the work straight back onto the
  reviewer. `utils/pdfText.js` walks the content streams directly instead:
  stateless, dependency-free, and it returns empty (→ an honest `unreadable`
  flag) rather than guessing when it cannot read a file.
- **Applicant status is derived, never assigned.** `deriveApplicantStatus()`
  recomputes from the full required-document checklist after every upload,
  verify and reject, and `enrollApplicant` re-derives rather than trusting the
  stored value — enrolment is the point where a stale status would actually
  admit someone.
- **`DocumentSubmission` carries a denormalised `flagCount`** so the
  flagged-first queue ordering comes off the
  `{ status, flagCount: -1, createdAt }` index instead of an in-memory sort.
- **Re-uploading a document type replaces the file and resets it to `pending`.**
  A resubmission has to be looked at again.
- Files live in `apps/api/secure-storage/admission-docs/<collegeId>/` under
  generated UUID names, outside the `/storage` static mount.

**Every route in PRD §7 (the full API catalogue) exists and is mounted.**
Nothing returns fake/mock data — it's all real Mongoose queries against
whatever's in your MongoDB.

### Known gaps to close before demo day

1. **File uploads** (OD supporting docs, grievance attachments) — models have
   the fields (`supportingDocPath`, `attachmentPath`) but no `multer` upload
   route is wired yet. Add a small `POST /api/uploads` route using `multer`,
   store to `apps/api/storage/uploads/`, return the path.
2. **Web Push** — `utils/notify.js` has the `TODO` marked. Needs VAPID keys
   (`.env`) + a service worker on the frontend (`apps/web/public/sw.js`,
   not yet created).
3. **Email** — Nodemailer is a dependency but not yet called anywhere. Wire
   it into `certificate_ready` notifications and `forgotPassword`.
4. **`totpSecret` is stored in plaintext** in `User` — fine for a hackathon
   demo, but encrypt at rest (e.g. `crypto` AES) before treating this as
   production-ready.

---

## 3. Frontend — `apps/web/src`

| Screen | Route | Status |
|---|---|---|
| Login (password + TOTP step) | `/login` | ✅ |
| **University bulk submission** (CSV + documents, per-row report) | `/admin/admissions/upload` | ✅ |
| **Applicant tracking** (paginated, checklist progress, enrol) | `/admin/admissions/applicants` | ✅ |
| Applicant detail + required-document checklist | `/admin/admissions/applicants/:applicantId` | ✅ |
| **TNTEU verification queue** (flagged-first, throughput stats, per-university backlog) | `/admin/verification` | ✅ `tnteu_admin` only |
| **Side-by-side document review** (preview · editable fields · flags · verify/reject) | `/admin/verification/:documentId` | ✅ `tnteu_admin` only |
| Student admission status + checklist | `/student/admission` | ✅ |
| Student dashboard (live %, streak, warning banner) | `/student/dashboard` | ✅ |
| Faculty attendance marking (the hero feature) | `/faculty/attendance` | ✅ — simplified roster input (paste student IDs); swap for a real `GET /api/attendance/course/:courseId/date/:date` roster call when you have a course picker |
| Student attendance detail + OD form | `/student/attendance` | ✅ |
| Student results / marks timeline | `/student/results` | ✅ |
| Student certificates (request + download) | `/student/certificates` | ✅ |
| Student grievances (submit + stepper) | `/student/grievances` | ✅ |
| Faculty result entry + assessment create | `/faculty/results` | ✅ |
| Faculty OD request review | `/faculty/od-requests` | ✅ |
| Admin dashboard widgets (6 cards) | `/admin/dashboard` | ✅ |
| Admin user management | `/admin/users` | 🟡 (PlaceholderPage — backend ready) |
| Admin certificate approval | `/admin/certificates` | ✅ |
| Admin grievance handling | `/admin/grievances` | ✅ |
| Public `/verify/:certId` page | `/verify/:certId` | ✅ — unauthenticated, QR-scannable |
| Notification centre (bell dropdown) | AppShell header | ✅ — polls every 30s, mark-all-read |
| Assessment leaderboard UI | — | ⬜ backend ready at `GET /api/marks/assessment/:assessmentId/leaderboard` |

Every 🟡 page currently renders `PlaceholderPage`, which shows the exact
API route to call. That's intentional — replace the placeholder with a real
component; the data layer underneath is already live.

### Design system

`tailwind.config.js` encodes the PRD's exact tokens (`primary`, `secondary`,
`danger`/`warning`/`success` for attendance thresholds, `gold` for
gamification). Reusable primitives are in `src/components/ui/` — `Button`,
`Card`, `Badge`, `ProgressBar`. Build new screens with those, not raw
Tailwind classes, to keep the "calm government-utility" look consistent.

---

## 4. Suggested build order (mirrors PRD §8.2, hour-by-hour)

1. **OD request flow (student side)** — form at `/student/od-request/new`
   (note: `Login`'s absent notification already links here via
   `linkTo` in `notifyAbsent()`) → `POST /api/attendance/od-request`
2. **Faculty OD review** — replace `/faculty/od-requests` placeholder,
   call `GET /api/attendance/od-requests` + `PATCH /api/attendance/od-request/:id`
3. **Result entry (faculty) + result dashboard (student)** — `POST /api/marks/:assessmentId`
   and `GET /api/marks/student/:studentId`
4. **Certificate request + admin approval** — `POST /api/certificates/request`,
   admin screen against `GET /api/certificates/requests`
5. **Public verify page** — small unauthenticated route, big demo payoff
6. **Grievance submit/track** — student + admin screens
7. **Admin dashboard widgets** — `GET /api/admin/dashboard` returns all
   widget data in one call already
8. **Leaderboard + notification centre** — polish pass

## 5. Conventions for whoever builds next

- Backend: one controller file per domain in `controllers/`, thin route
  files in `routes/` that just wire path → middleware → handler. Follow
  that pattern for anything new (don't put logic directly in route files).
- All protected routes go through `requireAuth` (+ `requireRole(...)` where
  the PRD's access column says so — see `routes/*.js` for examples).
- Frontend: use `api` from `src/api/client.js` for every request — it
  already handles the JWT header and silent refresh-on-401.
- Every model file matches a collection in PRD §6.1 exactly — don't rename
  fields without updating this doc and the PRD together.
