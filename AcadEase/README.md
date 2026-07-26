# AcadEase

Unified student academic management platform — built for the TNTEU problem
statement at SheBuilds Chennai × CCCL Hack — Code & Challenge 3.0.

This is the **base scaffold**: a working, connected, seeded full-stack app
you can build on directly during the hackathon. See `ARCHITECTURE.md` for
what's fully implemented vs. what's stubbed and ready to be filled in
(matches the pre-hackathon plan in the PRD, Section 8.1).

## Stack

- **Backend**: Node.js + Express + MongoDB (Mongoose)
- **Frontend**: React (Vite) + Tailwind CSS
- **Auth**: JWT (access + httpOnly refresh) + TOTP 2FA for faculty/admin/superadmin
- **Certificates**: Server-side PDFKit generation + QR (`qrcode`) + HMAC-SHA256 signing

## Project layout

```
AcadEase/
├── apps/
│   ├── api/          # Express backend
│   └── web/          # React frontend (Vite)
├── ARCHITECTURE.md    # What's built, what's stubbed, conventions, next steps
└── README.md          # You are here
```

## Prerequisites

- Node.js 18+
- A MongoDB instance — either:
  - Local: `mongod` running on `mongodb://127.0.0.1:27017`, or
  - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free tier (recommended — no local install, works from any laptop on the day)

## 1. Backend setup

```bash
cd apps/api
cp .env.example .env
# edit .env — at minimum set MONGO_URI to your Atlas connection string
npm install
npm run seed     # loads realistic demo data (15 students, 5 courses, 6 weeks attendance, etc.)
npm run dev       # starts on http://localhost:5000
```

Check it's alive:

```bash
curl http://localhost:5000/health
```

The seed script prints demo login IDs at the end. All seeded accounts use
the password `Passw0rd!`. Faculty/admin/superadmin accounts have TOTP
**disabled** on first seed — call `POST /api/auth/setup-totp` with their
`userId` + password once to enroll (returns a QR/otpauth URL for Google
Authenticator), then log in normally afterward.

## 2. Frontend setup

```bash
cd apps/web
cp .env.example .env   # points at http://localhost:5000/api by default
npm install
npm run dev             # starts on http://localhost:5173
```

Open `http://localhost:5173`, log in with a seeded student ID
(printed by the seed script) and password `Passw0rd!`.

## What works right now, end to end

- Login (student, and faculty/admin with TOTP 2FA) → JWT session
- Student dashboard: live attendance %, colour-coded subject cards, low-attendance
  warning banner, streak badge — all reading real seeded data from MongoDB
- Faculty attendance marking screen → writes `AttendanceRecord`s → automatically
  queues an absent-notification for every student marked absent (the PRD's
  "centrepiece feature", Section 5.2.2)
- Every other route in the PRD's API catalogue (Section 7) is implemented on
  the backend with real Mongoose logic — see `ARCHITECTURE.md` for the full
  list and which frontend screens still need building around them

## Deploying (per PRD Section 8.1)

- **Frontend** → Vercel: point it at `apps/web`, set `VITE_API_BASE_URL` to
  your deployed API URL
- **Backend** → Render (or Railway): point it at `apps/api`, set the same
  environment variables as `.env.example`, use MongoDB Atlas as `MONGO_URI`

## Team

SafeCircle — Meera, Niranjana, Mayurika, Monisha · SKCET, Coimbatore
