import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import StudentDashboard from "./pages/student/Dashboard.jsx";
import StudentAttendance from "./pages/student/Attendance.jsx";
import StudentResults from "./pages/student/Results.jsx";
import StudentCertificates from "./pages/student/Certificates.jsx";
import StudentGrievances from "./pages/student/Grievances.jsx";
import StudentProfile from "./pages/student/Profile.jsx";
import StudentOdRequests from "./pages/student/OdRequests.jsx";
import StudyMaterialsPage from "./pages/StudyMaterials.jsx";
import FacultyDashboard from "./pages/faculty/Dashboard.jsx";
import FacultyAttendanceMarking from "./pages/faculty/AttendanceMarking.jsx";
import FacultyResultEntry from "./pages/faculty/ResultEntry.jsx";
import FacultyOdRequests from "./pages/faculty/OdRequests.jsx";
import FacultyProfile from "./pages/faculty/Profile.jsx";
import AdminDashboard from "./pages/admin/Dashboard.jsx";
import AdminUsers from "./pages/admin/Users.jsx";
import AdminDepartments from "./pages/admin/Departments.jsx";
import AdminCourses from "./pages/admin/Courses.jsx";
import AdminCertificates from "./pages/admin/Certificates.jsx";
import AdminGrievances from "./pages/admin/Grievances.jsx";
import AdminCirculars from "./pages/admin/Circulars.jsx";
import CollegeAnalytics from "./pages/admin/CollegeAnalytics.jsx";
import UmisStudents from "./pages/admin/UmisStudents.jsx";
import UmisStudentDetail from "./pages/admin/UmisStudentDetail.jsx";
import AdminAttendance from "./pages/admin/Attendance.jsx";
import AdminMarks from "./pages/admin/Marks.jsx";
import AdminReports from "./pages/admin/Reports.jsx";
import AdminProfile from "./pages/admin/Profile.jsx";
import AdmissionsUpload from "./pages/admin/AdmissionsUpload.jsx";
import AdmissionsApplicants from "./pages/admin/AdmissionsApplicants.jsx";
import AdmissionsApplicantDetail from "./pages/admin/AdmissionsApplicantDetail.jsx";
import VerificationQueue from "./pages/admin/VerificationQueue.jsx";
import UniversityRequests from "./pages/admin/UniversityRequests.jsx";
import UniversityRequestDetail from "./pages/admin/UniversityRequestDetail.jsx";
import VerificationReview from "./pages/admin/VerificationReview.jsx";
import StudentAdmissionStatus from "./pages/student/AdmissionStatus.jsx";
import ApplyRegister from "./pages/apply/Register.jsx";
import ApplyLogin from "./pages/apply/Login.jsx";
import ApplyDocuments from "./pages/apply/Documents.jsx";
import ApplyStatus from "./pages/apply/Status.jsx";
import { ApplicantProvider } from "./context/ApplicantContext.jsx";
import CertVerify from "./pages/verify/CertVerify.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      {/* Public — no auth required */}
      <Route path="/verify/:certId" element={<CertVerify />} />

      {/* Pre-admission applicant portal — its own session, separate from the
          staff/student one, and retired the moment the applicant is enrolled. */}
      <Route path="/apply" element={<ApplicantProvider><ApplyRegister /></ApplicantProvider>} />
      <Route path="/apply/login" element={<ApplicantProvider><ApplyLogin /></ApplicantProvider>} />
      <Route path="/apply/documents" element={<ApplicantProvider><ApplyDocuments /></ApplicantProvider>} />
      <Route path="/apply/status" element={<ApplicantProvider><ApplyStatus /></ApplicantProvider>} />

      {/* Student */}
      <Route path="/student/dashboard" element={<ProtectedRoute roles={["student"]}><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/attendance" element={<ProtectedRoute roles={["student"]}><StudentAttendance /></ProtectedRoute>} />
      <Route path="/student/results" element={<ProtectedRoute roles={["student"]}><StudentResults /></ProtectedRoute>} />
      <Route path="/student/certificates" element={<ProtectedRoute roles={["student"]}><StudentCertificates /></ProtectedRoute>} />
      <Route path="/student/grievances" element={<ProtectedRoute roles={["student"]}><StudentGrievances /></ProtectedRoute>} />
      <Route path="/student/od-requests" element={<ProtectedRoute roles={["student"]}><StudentOdRequests /></ProtectedRoute>} />
      <Route path="/student/study-materials" element={<ProtectedRoute roles={["student"]}><StudyMaterialsPage /></ProtectedRoute>} />
      <Route path="/admin/study-materials" element={<ProtectedRoute roles={["college_admin", "faculty"]}><StudyMaterialsPage /></ProtectedRoute>} />

      <Route path="/student/admission" element={<ProtectedRoute roles={["student"]}><StudentAdmissionStatus /></ProtectedRoute>} />

      {/* Student own profile */}
      <Route path="/student/profile" element={<ProtectedRoute roles={["student"]}><StudentProfile /></ProtectedRoute>} />

      {/* Student profile — accessible by admin, superadmin, faculty */}
      <Route
        path="/profile/:studentId"
        element={
          <ProtectedRoute roles={["college_admin", "tnteu_admin", "faculty"]}>
            <StudentProfile />
          </ProtectedRoute>
        }
      />

      {/* Faculty */}
      <Route path="/faculty/dashboard" element={<ProtectedRoute roles={["faculty"]}><FacultyDashboard /></ProtectedRoute>} />
      <Route path="/faculty/attendance" element={<ProtectedRoute roles={["faculty"]}><FacultyAttendanceMarking /></ProtectedRoute>} />
      <Route path="/faculty/results" element={<ProtectedRoute roles={["faculty"]}><FacultyResultEntry /></ProtectedRoute>} />
      <Route path="/faculty/od-requests" element={<ProtectedRoute roles={["faculty"]}><FacultyOdRequests /></ProtectedRoute>} />
      <Route path="/faculty/profile" element={<ProtectedRoute roles={["faculty"]}><FacultyProfile /></ProtectedRoute>} />

      {/* Admission verification — the TNTEU bulk-processing workflow */}
      <Route path="/admin/admissions/upload" element={<ProtectedRoute roles={["college_admin", "college_coordinator", "tnteu_admin"]}><AdmissionsUpload /></ProtectedRoute>} />
      <Route path="/admin/admissions/applicants" element={<ProtectedRoute roles={["college_admin", "college_coordinator", "tnteu_admin"]}><AdmissionsApplicants /></ProtectedRoute>} />
      <Route path="/admin/admissions/applicants/:applicantId" element={<ProtectedRoute roles={["college_admin", "college_coordinator", "tnteu_admin"]}><AdmissionsApplicantDetail /></ProtectedRoute>} />
      {/* Both stages of the review chain use the same two screens. Which
          documents appear, and whether the decision buttons are live, is
          decided by the server from the caller's role — not by the route. */}
      <Route path="/admin/verification" element={<ProtectedRoute roles={["college_admin", "college_coordinator", "tnteu_admin"]}><VerificationQueue /></ProtectedRoute>} />
      <Route path="/admin/verification/:documentId" element={<ProtectedRoute roles={["college_admin", "college_coordinator", "tnteu_admin"]}><VerificationReview /></ProtectedRoute>} />

      {/* University ↔ TNTEU governance requests */}
      <Route path="/admin/university-requests" element={<ProtectedRoute roles={["college_admin", "college_coordinator", "tnteu_admin"]}><UniversityRequests /></ProtectedRoute>} />
      <Route path="/admin/university-requests/:requestId" element={<ProtectedRoute roles={["college_admin", "college_coordinator", "tnteu_admin"]}><UniversityRequestDetail /></ProtectedRoute>} />

      {/* TNTEU (super admin) only — cross-college oversight */}
      <Route path="/admin/analytics" element={<ProtectedRoute roles={["tnteu_admin"]}><CollegeAnalytics /></ProtectedRoute>} />
      <Route path="/admin/umis" element={<ProtectedRoute roles={["tnteu_admin"]}><UmisStudents /></ProtectedRoute>} />
      <Route path="/admin/umis/:userId" element={<ProtectedRoute roles={["tnteu_admin"]}><UmisStudentDetail /></ProtectedRoute>} />

      {/* Admin / SuperAdmin — full module suite. The day-to-day academic
          modules (results, attendance, grievances, reports, study materials)
          belong to the college that runs them; TNTEU sees the same ground
          through College-wise Analysis and the UMIS register instead. */}
      <Route path="/admin/dashboard" element={<ProtectedRoute roles={["college_admin", "tnteu_admin"]}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute roles={["college_admin", "tnteu_admin"]}><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/departments" element={<ProtectedRoute roles={["college_admin", "tnteu_admin"]}><AdminDepartments /></ProtectedRoute>} />
      <Route path="/admin/courses" element={<ProtectedRoute roles={["college_admin", "tnteu_admin"]}><AdminCourses /></ProtectedRoute>} />
      <Route path="/admin/certificates" element={<ProtectedRoute roles={["college_admin", "tnteu_admin"]}><AdminCertificates /></ProtectedRoute>} />
      <Route path="/admin/grievances" element={<ProtectedRoute roles={["college_admin"]}><AdminGrievances /></ProtectedRoute>} />
      <Route path="/admin/attendance" element={<ProtectedRoute roles={["college_admin"]}><AdminAttendance /></ProtectedRoute>} />
      <Route path="/admin/results" element={<ProtectedRoute roles={["college_admin"]}><AdminMarks /></ProtectedRoute>} />
      <Route path="/admin/marks" element={<ProtectedRoute roles={["college_admin"]}><AdminMarks /></ProtectedRoute>} />
      <Route path="/admin/circulars" element={<ProtectedRoute roles={["college_admin", "tnteu_admin", "faculty"]}><AdminCirculars /></ProtectedRoute>} />
      {/* Pre-rename spelling — anything still linking here lands on the same screen. */}
      <Route path="/admin/announcements" element={<Navigate to="/admin/circulars" replace />} />
      <Route path="/admin/reports" element={<ProtectedRoute roles={["college_admin"]}><AdminReports /></ProtectedRoute>} />
      <Route path="/admin/profile" element={<ProtectedRoute roles={["college_admin", "tnteu_admin"]}><AdminProfile /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
