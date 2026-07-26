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
| Seed script | `seed/seed.js` | ✅ matches PRD §9 exactly |

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
