import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Flame, FileText, Upload, Trash2, ExternalLink,
  Edit2, Save, X, Building2, Calendar, Layers, Grid3X3, Linkedin,
} from "lucide-react";
import api from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AppShell from "../../components/layout/AppShell.jsx";
import Card from "../../components/ui/Card.jsx";

function getInitials(name = "") {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const TABS = ["Personal Info", "Academic", "Resume"];

export default function StudentProfile() {
  const { studentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("Personal Info");
  const isOwnProfile = !studentId;

  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeMsg, setResumeMsg] = useState("");
  const [resumePath, setResumePath] = useState(null);
  const [showResumePdf, setShowResumePdf] = useState(false);
  const fileInputRef = useRef(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [form, setForm] = useState({});

  useEffect(() => {
    const targetId = studentId || user?.userId;
    if (!targetId) return;

    const profilePromise = isOwnProfile
      ? Promise.all([
          api.get("/users/me"),
          api.get(`/attendance/student/${targetId}/summary`).catch(() => ({ data: { overallPercentage: 0, subjects: [] } })),
          api.get(`/gamification/xp/${targetId}`).catch(() => ({ data: { totalXp: 0, streak: 0 } })),
        ]).then(([meRes, attRes, xpRes]) => ({
          data: {
            student: meRes.data.user,
            attendance: attRes.data,
            marks: [],
            xp: xpRes.data,
          },
        }))
      : api.get(`/admin/users/${targetId}`);

    profilePromise
      .then((res) => {
        setData(res.data);
        const s = res.data.student;
        if (s?.resumePath) setResumePath(s.resumePath);
        setForm({
          name: s?.name || "",
          email: s?.email || "",
          enrollmentNumber: s?.enrollmentNumber || "",
          dob: s?.dob || "",
          phone: s?.phone || "",
          parentPhone: s?.parentPhone || "",
          linkedin: s?.linkedin || "",
          tenth: s?.tenth ?? "",
          twelfth: s?.twelfth ?? "",
          diploma: s?.diploma ?? "",
          ugPercentage: s?.ugPercentage ?? "",
          backlogs: s?.backlogs ?? "",
          currentBacklogs: s?.currentBacklogs ?? "",
          interests: s?.interests || "",
        });
      })
      .catch(() => setError("Could not load profile."))
      .finally(() => setLoading(false));
  }, [studentId, user]);

  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    try {
      const payload = {
        phone: form.phone,
        parentPhone: form.parentPhone,
        dob: form.dob,
        linkedin: form.linkedin,
        tenth: form.tenth === "" ? null : Number(form.tenth),
        twelfth: form.twelfth === "" ? null : Number(form.twelfth),
        diploma: form.diploma === "" ? null : Number(form.diploma),
        ugPercentage: form.ugPercentage === "" ? null : Number(form.ugPercentage),
        backlogs: form.backlogs === "" ? 0 : Number(form.backlogs),
        currentBacklogs: form.currentBacklogs === "" ? 0 : Number(form.currentBacklogs),
        interests: form.interests,
      };
      const res = await api.patch("/users/me", payload);
      setData((prev) => ({ ...prev, student: res.data.user }));
      setSaveMsg("Profile saved.");
      setEditing(false);
    } catch {
      setSaveMsg("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResumeUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeUploading(true);
    setResumeMsg("");
    const formData = new FormData();
    formData.append("resume", file);
    try {
      const res = await api.post("/users/me/resume", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setResumePath(res.data.resumePath);
      setResumeMsg("Resume uploaded successfully.");
    } catch {
      setResumeMsg("Upload failed. Max 5 MB, PDF/DOC/DOCX only.");
    } finally {
      setResumeUploading(false);
      e.target.value = "";
    }
  }

  async function handleResumeDelete() {
    if (!window.confirm("Delete your resume?")) return;
    try {
      await api.delete("/users/me/resume");
      setResumePath(null);
      setShowResumePdf(false);
      setResumeMsg("Resume deleted.");
    } catch {
      setResumeMsg("Failed to delete resume.");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />)}
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        {studentId && (
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-secondary hover:text-signal mb-4">
            <ArrowLeft size={16} /> Back
          </button>
        )}
        <p className="text-danger text-sm">{error || "Profile not found."}</p>
      </AppShell>
    );
  }

  const { student, xp } = data;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api$/, "");
  const resumeUrl = resumePath ? `${apiBase}/${resumePath}` : null;

  const college = student.college || "Tamil Nadu Teachers Education University";
  const batch = student.batch || (student.batchYear ? `${student.batchYear}-${student.batchYear + 4}` : "2024-2028");
  const department = student.department || student.departmentId || "BTech Artificial Intelligence and Data Science";
  const section = student.section || "E";

  return (
    <AppShell>
      {studentId && (
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-secondary hover:text-signal mb-5 transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
      )}

      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-primary">Student Profile</h1>
        <p className="text-sm text-text-secondary mt-0.5">Manage your personal information</p>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── LEFT SIDEBAR ── */}
        <div className="w-full lg:w-72 shrink-0 flex flex-col gap-4">

          {/* Avatar + name + roll */}
          <Card className="p-6 flex flex-col items-center text-center gap-3">
            <div className="w-20 h-20 rounded-full bg-signal/80 border-4 border-signal/20 text-white flex items-center justify-center font-display text-2xl font-bold">
              {getInitials(student.name)}
            </div>
            <div>
              <p className="font-display text-base font-bold text-text-primary leading-tight">{student.name}</p>
              <p className="text-xs text-text-secondary mt-0.5">{student.name}</p>
              <p className="text-xs font-mono text-text-muted mt-1">{student.enrollmentNumber}</p>
            </div>
            {xp?.streak > 0 && (
              <div className="flex items-center gap-1.5 bg-citrus/10 rounded-full px-3 py-1">
                <Flame size={13} className="text-citrus" />
                <span className="text-xs font-semibold text-citrus">{xp.streak} day streak</span>
              </div>
            )}
          </Card>

          {/* Non-editable info cards */}
          <InfoCard icon={Building2} label="College" value={college} />
          <InfoCard icon={Calendar} label="Batch" value={batch} />
          <InfoCard icon={Layers} label="Department" value={department} />
          <InfoCard icon={Grid3X3} label="Section" value={section} />
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 min-w-0">

          {/* Tab bar + action buttons */}
          <div className="flex items-center justify-between mb-5 border-b border-border">
            <div className="flex gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? "border-signal text-signal"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {isOwnProfile && activeTab !== "Resume" && (
              <div className="flex gap-2 pb-1">
                {!editing ? (
                  <button
                    onClick={() => { setEditing(true); setSaveMsg(""); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-signal text-white rounded-lg text-xs font-semibold hover:bg-signal/90 transition-colors"
                  >
                    <Edit2 size={12} /> Edit Profile
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-signal text-white rounded-lg text-xs font-semibold hover:bg-signal/90 transition-colors disabled:opacity-60"
                    >
                      <Save size={12} /> {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => { setEditing(false); setSaveMsg(""); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-paper border border-border text-text-secondary rounded-lg text-xs font-semibold hover:text-text-primary transition-colors"
                    >
                      <X size={12} /> Cancel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {saveMsg && (
            <p className={`text-xs mb-4 ${saveMsg.includes("Failed") ? "text-danger" : "text-success"}`}>{saveMsg}</p>
          )}

          {/* Tab: Personal Info */}
          {activeTab === "Personal Info" && (
            <Card className="p-6">
              <h2 className="font-display text-base font-bold text-text-primary mb-5">Personal Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Full Name *" value={form.name} editing={false} />
                <Field label="Email *" value={form.email} editing={false} />
                <Field label="Roll Number *" value={form.enrollmentNumber} editing={false} />
                <Field
                  label="Date of Birth *"
                  value={form.dob}
                  editing={editing}
                  type="date"
                  onChange={(v) => setForm((p) => ({ ...p, dob: v }))}
                />
                <Field
                  label="Contact Number *"
                  value={form.phone}
                  editing={editing}
                  onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
                />
                <Field
                  label="Parent's Phone (for SMS alerts)"
                  value={form.parentPhone}
                  editing={editing}
                  onChange={(v) => setForm((p) => ({ ...p, parentPhone: v }))}
                />
                <Field
                  label="LinkedIn"
                  value={form.linkedin}
                  editing={editing}
                  onChange={(v) => setForm((p) => ({ ...p, linkedin: v }))}
                  isLink
                />
              </div>
            </Card>
          )}

          {/* Tab: Academic */}
          {activeTab === "Academic" && (
            <Card className="p-6">
              <h2 className="font-display text-base font-bold text-text-primary mb-5">Academic Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="10th Percentage :" value={form.tenth} editing={editing} type="number" onChange={(v) => setForm((p) => ({ ...p, tenth: v }))} />
                <Field label="12th Percentage :" value={form.twelfth} editing={editing} type="number" onChange={(v) => setForm((p) => ({ ...p, twelfth: v }))} />
                <Field label="Diploma Percentage :" value={form.diploma} editing={editing} type="number" onChange={(v) => setForm((p) => ({ ...p, diploma: v }))} />
                <Field label="Undergraduate Percentage :" value={form.ugPercentage} editing={editing} type="number" onChange={(v) => setForm((p) => ({ ...p, ugPercentage: v }))} />
                <Field label="Backlogs History :" value={form.backlogs} editing={editing} type="number" onChange={(v) => setForm((p) => ({ ...p, backlogs: v }))} />
                <Field label="Current Backlogs :" value={form.currentBacklogs} editing={editing} type="number" onChange={(v) => setForm((p) => ({ ...p, currentBacklogs: v }))} />
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">Interests :</label>
                  {editing ? (
                    <textarea
                      value={form.interests}
                      onChange={(e) => setForm((p) => ({ ...p, interests: e.target.value }))}
                      rows={3}
                      className="input w-full resize-none"
                      placeholder="e.g. Machine Learning, Web Development…"
                    />
                  ) : (
                    <p className="text-sm text-text-primary min-h-[2rem]">
                      {form.interests || <span className="text-text-muted">—</span>}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Tab: Resume */}
          {activeTab === "Resume" && (
            <Card className="p-6">
              <h2 className="font-display text-base font-bold text-text-primary mb-5">Resume</h2>
              {resumeMsg && (
                <p className={`text-xs mb-4 ${resumeMsg.includes("fail") || resumeMsg.includes("Failed") ? "text-danger" : "text-success"}`}>
                  {resumeMsg}
                </p>
              )}
              {resumeUrl ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-paper border border-border rounded-xl">
                    <FileText size={20} className="text-signal shrink-0" />
                    <span className="text-sm text-text-primary font-medium flex-1">Resume on file</span>
                    <a href={resumeUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-signal hover:underline">
                      <ExternalLink size={13} /> Open
                    </a>
                    {isOwnProfile && (
                      <button onClick={handleResumeDelete} className="flex items-center gap-1 text-xs text-danger hover:underline">
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </div>

                  {showResumePdf ? (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-paper border-b border-border">
                        <span className="text-xs text-text-muted">Preview</span>
                        <button onClick={() => setShowResumePdf(false)} className="text-xs text-text-muted hover:text-text-primary">Hide</button>
                      </div>
                      <iframe src={resumeUrl} title="Resume" className="w-full h-[75vh]" />
                    </div>
                  ) : (
                    <button onClick={() => setShowResumePdf(true)} className="text-xs text-signal hover:underline">
                      Preview in page ↓
                    </button>
                  )}

                  {isOwnProfile && (
                    <div className="pt-2 border-t border-border">
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeUpload} />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={resumeUploading}
                        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-signal transition-colors disabled:opacity-60"
                      >
                        <Upload size={13} /> {resumeUploading ? "Uploading…" : "Replace resume"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <FileText size={36} className="text-text-muted" />
                  <p className="text-sm text-text-muted">No resume uploaded yet.</p>
                  {isOwnProfile && (
                    <>
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeUpload} />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={resumeUploading}
                        className="flex items-center gap-2 px-4 py-2 bg-signal text-white rounded-xl text-sm font-semibold hover:bg-signal/90 transition-colors disabled:opacity-60"
                      >
                        <Upload size={14} /> {resumeUploading ? "Uploading…" : "Upload Resume"}
                      </button>
                      <p className="text-xs text-text-muted">PDF, DOC, DOCX · Max 5 MB</p>
                    </>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 shadow-card">
      <div className="w-7 h-7 rounded-lg bg-signal/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={14} className="text-signal" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-muted font-medium">{label}</p>
        <p className="text-sm font-semibold text-text-primary mt-0.5 leading-snug break-words">{value}</p>
      </div>
    </div>
  );
}

function Field({ label, value, editing, onChange, type = "text", isLink = false }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-secondary mb-1.5">{label}</label>
      {editing && onChange ? (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="input w-full"
        />
      ) : (
        <p className="text-sm text-text-primary">
          {value !== "" && value != null ? (
            isLink ? (
              <a href={value} target="_blank" rel="noreferrer" className="text-signal hover:underline break-all">
                {value}
              </a>
            ) : (
              String(value)
            )
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </p>
      )}
    </div>
  );
}
