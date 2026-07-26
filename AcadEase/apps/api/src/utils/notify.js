import nodemailer from "nodemailer";
import { Notification, User } from "../models/index.js";

// ── Email transport (Nodemailer) ──────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return; // skip if not configured
  try {
    await transporter.sendMail({
      from: `"AcadEase" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("[email] failed to send:", err.message);
  }
}

// ── In-app notification ───────────────────────────────────────────────────────
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
  return notification;
}

// ── Absent alert: in-app + email ──────────────────────────────────────────────
export async function notifyAbsent({ studentId, courseName, sessionTime, courseId, date }) {
  const dateStr = new Date(date).toISOString().slice(0, 10);

  // 1. In-app notification
  await pushNotification({
    userId: studentId,
    type: "absent_alert",
    priority: "critical",
    title: "Marked absent",
    message: `You were marked absent for ${courseName} at ${sessionTime}. If this is incorrect, raise a dispute from your Attendance page.`,
    linkTo: `/student/attendance`,
    meta: { courseId, date: dateStr },
  });

  // 2. Email
  const student = await User.findOne({ userId: studentId }).select("email name");
  if (student?.email) {
    await sendEmail({
      to: student.email,
      subject: `Absent Alert — ${courseName}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
          <h2 style="color:#1a1a2e;margin-bottom:4px">Attendance Alert</h2>
          <p style="color:#6b7280;font-size:14px;margin-top:0">AcadEase · ${new Date().toDateString()}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
          <p style="font-size:15px;color:#111827">Hi <strong>${student.name}</strong>,</p>
          <p style="font-size:15px;color:#111827">
            You have been marked <strong style="color:#ef4444">absent</strong> for:
          </p>
          <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
            <tr><td style="padding:6px 0;color:#6b7280;width:120px">Subject</td><td style="color:#111827;font-weight:600">${courseName}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Date</td><td style="color:#111827">${dateStr}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Session</td><td style="color:#111827">${sessionTime}</td></tr>
          </table>
          <p style="font-size:14px;color:#374151">If you believe this is incorrect, log in to AcadEase and raise a dispute from your <strong>Attendance</strong> page.</p>
          <a href="${process.env.CLIENT_URL || "http://localhost:5173"}/student/attendance"
             style="display:inline-block;margin-top:8px;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
            View Attendance
          </a>
          <p style="font-size:12px;color:#9ca3af;margin-top:24px">This is an automated message from AcadEase. Do not reply.</p>
        </div>
      `,
    });
  }
}
