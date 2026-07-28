# AcadEase

AcadEase is a role-based academic management platform for students, faculty, and administrators. The current implementation includes attendance workflows, results, certificates, grievances, announcements, study materials, PYQ practice, TOTP-secured login, and a dedicated faculty dashboard.

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
npm run seed
```

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

Use the password: Passw0rd!

- Student: STU_2021_CS_001
- Faculty: FAC_CSE_001
- Admin: ADM_CSE_001
- Superadmin: SUP_001

---

## Key flows now covered

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
