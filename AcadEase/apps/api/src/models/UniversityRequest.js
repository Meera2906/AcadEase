import mongoose from "mongoose";
import { approvalSchema } from "./CertificateRequest.js";

// Institution-level business a college has to transact with TNTEU: renewing
// affiliation, asking for more seats, adding a programme, getting staff
// approved, being designated an exam centre. Today this moves by letter and
// follow-up phone call; here it is a queue with the same audit trail, the same
// encrypted attachments and the same counter-signatures as everything else.
export const UNIVERSITY_REQUEST_TYPES = {
  affiliation_renewal: {
    label: "Affiliation renewal",
    description: "Renew this college's affiliation to TNTEU for the coming academic year.",
    requiredDocuments: ["Previous affiliation order", "Infrastructure compliance report", "Staff list"],
  },
  seat_increase: {
    label: "Seat matrix revision",
    description: "Request a change to the sanctioned B.Ed / M.Ed intake.",
    requiredDocuments: ["Justification note", "Infrastructure proof", "Staff-to-student ratio statement"],
  },
  new_programme: {
    label: "New programme approval",
    description: "Seek approval to start a new programme at this college.",
    requiredDocuments: ["Programme proposal", "Curriculum outline", "Faculty availability statement"],
  },
  faculty_approval: {
    label: "Faculty appointment approval",
    description: "Get newly appointed teaching staff recognised by TNTEU.",
    requiredDocuments: ["Appointment order", "Qualification certificates", "Selection committee minutes"],
  },
  exam_centre: {
    label: "Examination centre designation",
    description: "Apply to be designated an examination centre.",
    requiredDocuments: ["Facility report", "Seating plan", "Invigilator list"],
  },
  course_revision: {
    label: "Curriculum revision",
    description: "Propose a revision to an approved course structure.",
    requiredDocuments: ["Revision proposal", "Board of studies resolution"],
  },
  other: {
    label: "Other correspondence",
    description: "Any other matter requiring a TNTEU decision.",
    requiredDocuments: [],
  },
};

// Attachments are encrypted exactly like admission proofs — a seat-matrix
// justification names staff and students, and belongs to one college only.
const attachmentSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    storedName: { type: String, required: true },
    filePath: { type: String, required: true },
    originalName: { type: String, default: null },
    mimeType: { type: String, default: null },
    size: { type: Number, default: 0 },
    fileHash: { type: String, required: true },
    encryption: { type: mongoose.Schema.Types.Mixed, default: {} },
    uploadedBy: { type: String, default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const universityRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true, index: true },
    collegeId: { type: String, required: true, index: true },
    type: { type: String, enum: Object.keys(UNIVERSITY_REQUEST_TYPES), required: true, index: true },

    title: { type: String, required: true },
    description: { type: String, required: true },
    academicYear: { type: String, default: null },

    // Structured payload per type — e.g. { currentBedSeats, requestedBedSeats }.
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    attachments: { type: [attachmentSchema], default: [] },

    status: {
      type: String,
      enum: ["draft", "submitted", "under_review", "clarification_requested", "approved", "rejected", "withdrawn"],
      default: "draft",
      index: true,
    },
    priority: { type: String, enum: ["routine", "urgent"], default: "routine" },

    submittedBy: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    decisionNote: { type: String, default: "" },

    // Two-way thread so a clarification does not need a phone call.
    messages: {
      type: [
        new mongoose.Schema(
          {
            authorId: { type: String, required: true },
            authorRole: { type: String, required: true },
            authorName: { type: String, default: null },
            body: { type: String, required: true },
            sentAt: { type: Date, default: Date.now },
          },
          { _id: true }
        ),
      ],
      default: [],
    },

    // TNTEU's signed decision, same chain machinery as certificates — an
    // approval order a college can show to anyone and have checked.
    approvals: { type: [approvalSchema], default: [] },
  },
  { timestamps: true }
);

universityRequestSchema.index({ collegeId: 1, status: 1, createdAt: -1 });
universityRequestSchema.index({ status: 1, priority: -1, submittedAt: 1 });

export default mongoose.model("UniversityRequest", universityRequestSchema);
