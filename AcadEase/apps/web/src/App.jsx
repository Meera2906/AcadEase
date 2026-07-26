import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import StudentDashboard from "./pages/student/Dashboard.jsx";
import StudentAttendance from "./pages/student/Attendance.jsx";
import StudentResults from "./pages/student/Results.jsx";
import StudentCertificates from "./pages/student/Certificates.jsx";
import StudentGrievances from "./pages/student/Grievances.jsx";
import StudentProfile from "./pages/student/Profile.jsx";
import FacultyAttendanceMarking from "./pages/faculty/AttendanceMarking.jsx";
import FacultyResultEntry from "./pages/faculty/ResultEntry.jsx";
import FacultyOdRequests from "./pages/faculty/OdRequests.jsx";
import AdminDashboard from "./pages/admin/Dashboard.jsx";
import AdminCertificates from "./pages/admin/Certificates.jsx";
import AdminGrievances from "./pages/admin/Grievances.jsx";
import PlaceholderPage from "./pages/PlaceholderPage.jsx";
import CertVerify from "./pages/verify/CertVerify.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      {/* Public — no auth required */}
      <Route path="/verify/:certId" element={<CertVerify />} />

      {/* Student */}
      <Route path="/student/dashboard" element={<ProtectedRoute roles={["student"]}><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/attendance" element={<ProtectedRoute roles={["student"]}><StudentAttendance /></ProtectedRoute>} />
      <Route path="/student/results" element={<ProtectedRoute roles={["student"]}><StudentResults /></ProtectedRoute>} />
      <Route path="/student/certificates" element={<ProtectedRoute roles={["student"]}><StudentCertificates /></ProtectedRoute>} />
      <Route path="/student/grievances" element={<ProtectedRoute roles={["student"]}><StudentGrievances /></ProtectedRoute>} />

      {/* Student own profile */}
      <Route path="/student/profile" element={<ProtectedRoute roles={["student"]}><StudentProfile /></ProtectedRoute>} />

      {/* Student profile — accessible by admin, superadmin, faculty */}
      <Route
        path="/profile/:studentId"
        element={
          <ProtectedRoute roles={["admin", "superadmin", "faculty"]}>
            <StudentProfile />
          </ProtectedRoute>
        }
      />

      {/* Faculty */}
      <Route path="/faculty/attendance" element={<ProtectedRoute roles={["faculty"]}><FacultyAttendanceMarking /></ProtectedRoute>} />
      <Route path="/faculty/results" element={<ProtectedRoute roles={["faculty"]}><FacultyResultEntry /></ProtectedRoute>} />
      <Route path="/faculty/od-requests" element={<ProtectedRoute roles={["faculty"]}><FacultyOdRequests /></ProtectedRoute>} />

      {/* Admin / SuperAdmin */}
      <Route path="/admin/dashboard" element={<ProtectedRoute roles={["admin", "superadmin"]}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/certificates" element={<ProtectedRoute roles={["admin", "superadmin"]}><AdminCertificates /></ProtectedRoute>} />
      <Route path="/admin/grievances" element={<ProtectedRoute roles={["admin", "superadmin"]}><AdminGrievances /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute roles={["superadmin"]}><PlaceholderPage title="User Management" apiHint="GET/POST/PATCH /api/admin/users" /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
