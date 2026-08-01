import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Database, Lock, FileBadge, CalendarCheck, ClipboardList, ShieldCheck } from "lucide-react";
import api from "../../api/client.js";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Toast, { useToast } from "../../components/ui/Toast.jsx";

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary mt-0.5">{value ?? "—"}</dd>
    </div>
  );
}

export default function UmisStudentDetail() {
  const { userId } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast, showToast, clearToast } = useToast();

  useEffect(() => {
    api.get(`/umis/students/${userId}`)
      .then((r) => setRecord(r.data.record))
      .catch((e) => showToast(e.response?.data?.error || "Could not open that UMIS file.", "error"))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <AppShell>
        <div className="h-64 bg-white border border-border rounded-card animate-pulse" />
      </AppShell>
    );
  }

  if (!record) {
    return (
      <AppShell>
        <Toast toast={toast} onClose={clearToast} />
        <Card className="text-center py-12">
          <Database size={26} className="text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No UMIS record for that student.</p>
          <Link to="/admin/umis" className="text-sm text-signal hover:underline mt-3 inline-block">Back to the register</Link>
        </Card>
      </AppShell>
    );
  }

  const { student, college, department, admission, attendance, results, certificates } = record;

  return (
    <AppShell>
      <Toast toast={toast} onClose={clearToast} />

      <Link to="/admin/umis" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-3">
        <ArrowLeft size={15} /> UMIS register
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">{student.name}</h1>
          <p className="text-xs text-text-muted mt-0.5">
            <span className="font-mono">{record.umisId}</span> · {college?.name || student.collegeId}
            {department?.name ? ` · ${department.name}` : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-semibold bg-[#F1EFE6] text-text-secondary">
          <Lock size={12} /> Read-only · this view is audit-logged
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <h2 className="font-display text-sm font-bold text-text-primary mb-4">Register entry</h2>
          <dl className="grid sm:grid-cols-3 gap-4">
            <Field label="UMIS ID" value={<span className="font-mono text-xs">{record.umisId}</span>} />
            <Field label="Login ID" value={<span className="font-mono text-xs">{student.userId}</span>} />
            <Field label="Enrolment number" value={student.enrollmentNumber} />
            <Field label="Email" value={student.email} />
            <Field label="Phone" value={student.phone} />
            <Field label="Date of birth" value={student.dob} />
            <Field label="College" value={college?.name || student.collegeId} />
            <Field label="District" value={college?.district} />
            <Field label="Affiliation code" value={college?.affiliationCode} />
            <Field label="Department" value={department?.name || student.departmentId} />
            <Field label="Semester / section" value={[student.semester, student.section].filter(Boolean).join(" / ")} />
            <Field label="Batch" value={student.batchYear} />
            <Field label="Status" value={<Badge status={student.isActive === false ? "holiday" : "active"}>{student.isActive === false ? "inactive" : "active"}</Badge>} />
            <Field label="Last login" value={student.lastLogin ? new Date(student.lastLogin).toLocaleString("en-IN") : "Never"} />
            <Field label="On record since" value={new Date(student.createdAt).toLocaleDateString("en-IN")} />
          </dl>
        </Card>

        <Card>
          <h2 className="font-display text-sm font-bold text-text-primary mb-4 flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-signal" /> Admission
          </h2>
          {admission ? (
            <dl className="space-y-3">
              <Field label="Application" value={<span className="font-mono text-xs">{admission.applicantId}</span>} />
              <Field label="Programme" value={admission.program} />
              <Field label="Category" value={admission.category} />
              <Field label="Verification" value={<Badge status={admission.status === "verified" ? "approved" : admission.status}>{admission.status.replace(/_/g, " ")}</Badge>} />
              <Field label="Enrolled on" value={admission.enrolledAt ? new Date(admission.enrolledAt).toLocaleDateString("en-IN") : "—"} />
              <Field
                label="Qualifying marks"
                value={[
                  admission.tenthPercentage && `10th ${admission.tenthPercentage}%`,
                  admission.twelfthPercentage && `12th ${admission.twelfthPercentage}%`,
                  admission.ugPercentage && `UG ${admission.ugPercentage}%`,
                  admission.bedPercentage && `B.Ed ${admission.bedPercentage}%`,
                ].filter(Boolean).join(" · ") || "—"}
              />
            </dl>
          ) : (
            <p className="text-sm text-text-secondary">
              No TNTEU admission record is linked to this student — they predate the verification pipeline or were
              added directly by the college.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-sm font-bold text-text-primary mb-3 flex items-center gap-1.5">
            <CalendarCheck size={15} className="text-signal" /> Attendance
          </h2>
          <p className="font-display text-3xl font-bold text-text-primary leading-none">
            {attendance.percentage != null ? `${attendance.percentage}%` : "—"}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {attendance.attended} of {attendance.total} sessions recorded
          </p>
        </Card>

        <Card>
          <h2 className="font-display text-sm font-bold text-text-primary mb-3 flex items-center gap-1.5">
            <ClipboardList size={15} className="text-signal" /> Results
          </h2>
          {results.length === 0 ? (
            <p className="text-sm text-text-secondary">No published results.</p>
          ) : (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r._id} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Semester {r.semester} · {r.academicYear}</span>
                  <Badge status={r.status === "published" ? "approved" : "pending"}>{r.status || "—"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-sm font-bold text-text-primary mb-3 flex items-center gap-1.5">
            <FileBadge size={15} className="text-signal" /> Certificates
          </h2>
          {certificates.length === 0 ? (
            <p className="text-sm text-text-secondary">None issued.</p>
          ) : (
            <ul className="space-y-2">
              {certificates.map((c) => (
                <li key={c.certId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-text-secondary capitalize truncate">
                    {String(c.type).replace(/_/g, " ")}
                    <span className="block text-[11px] text-text-muted">
                      {new Date(c.issuedAt).toLocaleDateString("en-IN")}
                    </span>
                  </span>
                  <Badge status={c.status === "active" ? "active" : "revoked"}>{c.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
