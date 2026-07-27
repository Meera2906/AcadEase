# AcadEase

**A unified academic management platform built for Tamil Nadu Teachers Education University (TNTEU)**

AcadEase replaces fragmented spreadsheets, paper registers, and disconnected portals with a single, role-aware web application that serves students, faculty, and administrators — from attendance marking to result publication, certificate issuance to grievance resolution.

> Built for the **SheBuilds Hackathon** — TNTEU Problem Statement

---

## The Problem

University administration today runs on WhatsApp forwards, Excel sheets, and manual counters. Students have no single place to track their attendance, results, or certificate requests. Faculty waste hours on paperwork. Admins have no real-time visibility. AcadEase fixes all of that.

---

## Features

### Student
- Live attendance dashboard with per-subject percentage, danger warnings, and streak tracking
- OD (On-Duty) request submission with supporting document upload
- Semester result viewer with subject-wise grades, GPA, and PDF download
- Certificate request portal (bonafide, completion, attendance) with real-time status tracking
- Grievance submission with category tagging and resolution tracking
- XP-based gamification — earn points for attendance streaks and on-time submissions
- In-app notification centre with real-time alerts

### Faculty
- One-click attendance marking with session management
- Assessment creation and marks entry (IA, assignments, practicals)
- OD request review and approval workflow
- Semester result entry and submission for admin review
- Rejection banner showing admin feedback with one-click resubmit

### Admin / Superadmin
- Institution-wide dashboard — live headcounts, attendance rates, pending actions
- Result review workflow — approve and publish or reject with reason (notifies faculty)
- Certificate approval with auto-generated PDF, QR code, and HMAC-signed verification link
- Grievance management with resolution notes
- Department and user management
- Announcement broadcasting

### Platform
- JWT authentication with role-based access (student / faculty / admin / superadmin)
- TOTP two-factor authentication for faculty and admin accounts
- Auto-generated semester result PDFs (PDFKit) with watermark, grade table, and GPA summary
- Email notifications via Resend on result publication
- SMS alerts to parents via Twilio on result publication
- Tamper-proof certificate verification — public `/verify/:certId` page, QR-scannable, HMAC-signed
- Rate limiting, Helmet security headers, CORS protection

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router v6, ApexCharts |
| Backend | Node.js, Express.js (ESM) |
| Database | MongoDB Atlas, Mongoose ODM |
| Auth | JWT (access + refresh tokens), otplib (TOTP 2FA) |
| PDF Generation | PDFKit |
| Email | Resend |
| SMS | Twilio |
| File Storage | Multer (local / Render disk) |
| Deployment | Render (API), Vercel (Web) |

---

## Project Structure

```
AcadEase/
├── apps/
│   ├── api/                        # Express backend
│   │   └── src/
│   │       ├── config/             # DB connection
│   │       ├── controllers/        # Business logic
│   │       ├── middleware/         # Auth, error handling
│   │       ├── models/             # 15 Mongoose models
│   │       ├── routes/             # Route definitions
│   │       ├── utils/              # JWT, TOTP, PDF, email, SMS, certificates
│   │       └── seed/               # Demo data seeder
│   └── web/                        # React frontend
│       └── src/
│           ├── api/                # Axios client
│           ├── components/         # Reusable UI primitives
│           ├── context/            # Auth context
│           ├── pages/
│           │   ├── admin/
│           │   ├── faculty/
│           │   ├── student/
│           │   └── verify/
│           └── routes/             # Role-based route guards
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/acadease.git
cd acadease
```

### 2. Configure the API

```bash
cd apps/api
cp .env.example .env
```

Edit `.env` with your values:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/acadease
JWT_ACCESS_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_other_secret_here
CERT_HMAC_SECRET=your_cert_secret_here
INSTITUTION_ID=TNTEU_001
INSTITUTION_NAME=Tamil Nadu Teachers Education University
RESEND_API_KEY=re_xxxxxxxxxxxx
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM=+1xxxxxxxxxx
API_URL=http://localhost:5000
CLIENT_URL=http://localhost:5173
```

### 3. Configure the Web app

```bash
cd apps/web
cp .env.example .env
```

```env
VITE_API_URL=http://localhost:5000/api
```

### 4. Install dependencies

```bash
# API
cd apps/api && npm install

# Web
cd apps/web && npm install
```

### 5. Seed the database

```bash
cd apps/api && npm run seed
```

This creates 15 students, 3 faculty, 2 admins, 5 courses, 6 weeks of attendance, assessments, marks, results, certificates, grievances, and 90 days of XP history.

### 6. Start the development servers

```bash
# Terminal 1 — API
cd apps/api && npm run dev

# Terminal 2 — Web
cd apps/web && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Demo Accounts

All accounts use the password: `Passw0rd!`

| Role | User ID |
|---|---|
| Student | `STU_2021_CS_001` |
| Faculty | `FAC_CSE_001` |
| Admin | `ADM_CSE_001` |
| Superadmin | `SUP_001` |

> Faculty and admin accounts require TOTP 2FA setup on first login.

---

## API Overview

Base URL: `/api`

| Domain | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `/auth/totp/verify`, `/auth/refresh`, `/auth/logout` |
| Attendance | `POST /attendance/mark`, `GET /attendance/summary/:studentId`, `GET /attendance/analytics` |
| OD Requests | `POST /attendance/od-request`, `PATCH /attendance/od-request/:id` |
| Assessments | `POST /assessments`, `POST /marks/:assessmentId`, `GET /marks/student/:studentId` |
| Results | `GET /results/semester/preview`, `POST /results/semester/publish-all`, `POST /results/semester/:studentId/submit-review`, `POST /results/semester/:studentId/reject` |
| Certificates | `POST /certificates/request`, `PATCH /certificates/:id/approve`, `GET /certificates/verify/:certId` |
| Grievances | `POST /grievances`, `PATCH /grievances/:id` |
| Notifications | `GET /notifications`, `PATCH /notifications/read-all` |
| Admin | `GET /admin/dashboard`, `GET /admin/users` |

Full route catalogue is in `apps/api/src/routes/`.

---

## Key Workflows

### Result Publication
1. Faculty enters marks via assessments
2. Faculty submits result for admin review → admins notified in-app
3. Admin reviews — approves (publishes) or rejects with a reason
4. On rejection, faculty sees a banner with the reason and a Resubmit button
5. On publish — result PDF auto-generated, student notified in-app + email, parent notified via SMS

### Certificate Issuance
1. Student requests a certificate (bonafide / completion / attendance)
2. Admin approves → PDF generated with QR code and HMAC signature
3. Student downloads PDF
4. Anyone can scan the QR or visit `/verify/:certId` to confirm authenticity — no login required

### Attendance OD Flow
1. Student marked absent → instant in-app notification + email
2. Student submits OD request with reason and optional document
3. Faculty reviews and approves/rejects
4. Approved OD updates the attendance record

---

## Deployment

### API — Render

1. Create a new **Web Service** on [render.com](https://render.com)
2. Set **Build Command**: `npm install`
3. Set **Start Command**: `node src/server.js`
4. Set **Root Directory**: `apps/api`
5. Add all environment variables from `.env.example` in the Render dashboard

### Web — Vercel

1. Import the repository on [vercel.com](https://vercel.com)
2. Set **Root Directory**: `apps/web`
3. Set **Build Command**: `npm run build`
4. Add environment variable: `VITE_API_URL=https://your-api.onrender.com/api`

---

## Data Models

15 Mongoose collections: `User`, `Department`, `Course`, `Enrollment`, `AttendanceRecord`, `ODRequest`, `Assessment`, `Marks`, `Result`, `CertificateRequest`, `Certificate`, `Grievance`, `Notification`, `XpLedger`, `Announcement`

---

## Security

- Passwords hashed with bcrypt (12 rounds)
- JWT access tokens with role-based expiry (students: 24h, staff: 8h, superadmin: 4h)
- TOTP 2FA enforced for all staff accounts
- HMAC-SHA256 signed certificates — tamper-evident, publicly verifiable
- Helmet security headers on all responses
- Per-IP rate limiting on auth endpoints (50 req / 15 min)
- CORS restricted to configured `CLIENT_URL`

---

## License

MIT
