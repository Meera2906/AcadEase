import { Grievance } from "../models/index.js";
import { pushNotification } from "../utils/notify.js";

// POST /api/grievances
export async function submitGrievance(req, res) {
  const studentId = req.user.userId;
  const { category, subject, description, attachmentPath } = req.body;
  if (!category || !subject || !description) {
    return res.status(400).json({ error: "category, subject, and description are required" });
  }

  const grievance = await Grievance.create({
    studentId,
    departmentId: req.user.departmentId,
    category,
    subject,
    description,
    attachmentPath,
  });

  res.status(201).json({ message: `Grievance submitted with ID ${grievance._id}`, grievance });
}

// GET /api/grievances/student/:studentId
export async function getStudentGrievances(req, res) {
  const { studentId } = req.params;
  const grievances = await Grievance.find({ studentId }).sort({ createdAt: -1 });
  res.json({ grievances });
}

// GET /api/grievances  (admin — filterable)
export async function listGrievances(req, res) {
  const { status, category } = req.query;
  const filter = { departmentId: req.user.departmentId };
  if (status) filter.status = status;
  if (category) filter.category = category;
  const grievances = await Grievance.find(filter).sort({ createdAt: -1 });
  res.json({ grievances });
}

// PATCH /api/grievances/:id/acknowledge
export async function acknowledgeGrievance(req, res) {
  const { id } = req.params;
  const grievance = await Grievance.findById(id);
  if (!grievance) return res.status(404).json({ error: "Grievance not found" });

  grievance.status = "In Review";
  grievance.handledBy = req.user.userId;
  await grievance.save();

  await pushNotification({
    userId: grievance.studentId,
    type: "grievance_update",
    priority: "medium",
    title: "Grievance is being reviewed",
    message: `Your grievance "${grievance.subject}" is now in review.`,
    linkTo: "/student/grievances",
  });

  res.json({ grievance });
}

// PATCH /api/grievances/:id/resolve
export async function resolveGrievance(req, res) {
  const { id } = req.params;
  const { resolutionNote } = req.body;
  const grievance = await Grievance.findById(id);
  if (!grievance) return res.status(404).json({ error: "Grievance not found" });

  grievance.status = "Resolved";
  grievance.resolutionNote = resolutionNote || "";
  grievance.handledBy = req.user.userId;
  grievance.resolvedAt = new Date();
  await grievance.save();

  await pushNotification({
    userId: grievance.studentId,
    type: "grievance_update",
    priority: "medium",
    title: "Grievance resolved",
    message: `Your grievance "${grievance.subject}" has been resolved.`,
    linkTo: "/student/grievances",
  });

  res.json({ grievance });
}

// PATCH /api/grievances/:id/reject
export async function rejectGrievance(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  const grievance = await Grievance.findById(id);
  if (!grievance) return res.status(404).json({ error: "Grievance not found" });

  grievance.status = "Rejected";
  grievance.rejectionReason = reason || "";
  grievance.handledBy = req.user.userId;
  await grievance.save();

  await pushNotification({
    userId: grievance.studentId,
    type: "grievance_update",
    priority: "medium",
    title: "Grievance rejected",
    message: `Your grievance "${grievance.subject}" was rejected. Reason: ${reason || "Not specified"}. You may resubmit once.`,
    linkTo: "/student/grievances",
  });

  res.json({ grievance });
}

// POST /api/grievances/:id/rating
export async function rateGrievance(req, res) {
  const { id } = req.params;
  const { rating } = req.body;
  const grievance = await Grievance.findById(id);
  if (!grievance) return res.status(404).json({ error: "Grievance not found" });
  if (grievance.status !== "Resolved") {
    return res.status(409).json({ error: "Can only rate a resolved grievance" });
  }

  grievance.satisfactionRating = rating;
  await grievance.save();
  res.json({ grievance });
}
