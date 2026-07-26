import { Notification } from "../models/index.js";

// Decoupled notification pipeline (PRD Section 10.1: "Notification pipeline
// decoupled from attendance marking"). In-app notifications are written to
// MongoDB and polled by the frontend every 30s. Web Push / email are wired
// as separate channels — stub them in when VAPID/SMTP creds are added.
export async function pushNotification({ userId, type, priority = "medium", title, message, linkTo = null, meta = {} }) {
  const notification = await Notification.create({
    userId,
    type,
    priority,
    title,
    message,
    linkTo,
    meta,
  });

  // TODO: Web Push via service worker (VAPID) — see .env VAPID_* keys.
  // TODO: Nodemailer dispatch for certificate_ready / password reset.
  return notification;
}

// The centrepiece feature (PRD 5.2.2). Called immediately after an
// AttendanceRecord with status "absent" is written.
export async function notifyAbsent({ studentId, courseName, sessionTime, courseId, date }) {
  return pushNotification({
    userId: studentId,
    type: "absent_alert",
    priority: "critical",
    title: "Marked absent",
    message: `You were marked absent for ${courseName} at ${sessionTime}. If you were on OD or arrived late, submit a request now.`,
    linkTo: `/student/od-request/new?course=${courseId}&date=${new Date(date).toISOString().slice(0, 10)}`,
    meta: { courseId, date },
  });
}
