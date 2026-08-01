export const universityAnalytics = {
  universityName: "Academia University",
  academicYear: "2025-2026",
  totalColleges: 126,
  totalStudents: 68450,
  totalFaculty: 4320,
  passPercentage: 87.6,
  arrearRate: 12.4,
  averageCGPA: 8.14,
  placementRate: 78.5,
  achievements: 482,
  examStatus: {
    hallTicketGeneration: { completed: 126, total: 126 },
    evaluatorAssignment: { completed: 119, total: 126 },
    answerScriptDispatch: { completed: 124, total: 126 }
  }
};

export const colleges = [
  {
    id: "c1",
    name: "ABC Institute of Technology",
    location: "Chennai, TN",
    established: 1995,
    type: "Private",
    students: 4250,
    faculty: 210,
    studentFacultyRatio: "20:1",
    passPercentage: 94.2,
    arrearRate: 5.8,
    averageCGPA: 8.72,
    placementRate: 91.4,
    highestPackage: "32 LPA",
    averagePackage: "8.5 LPA",
    achievements: ["Smart India Hackathon Winner 2026", "Best Industry Collaboration Award"],
    departments: [
      { name: "AI & Data Science", students: 420, passPercentage: 97, arrear: 3, cgpa: 9.1, placement: 98 },
      { name: "CSE", students: 850, passPercentage: 96, arrear: 4, cgpa: 8.9, placement: 95 },
      { name: "ECE", students: 620, passPercentage: 92, arrear: 6, cgpa: 8.4, placement: 88 }
    ],
    yearlyPerformance: [
      { year: 2023, pass: 88.2, cgpa: 7.9 },
      { year: 2024, pass: 90.4, cgpa: 8.2 },
      { year: 2025, pass: 94.2, cgpa: 8.72 }
    ],
    grievanceStats: { total: 42, resolved: 38, pending: 4 }
  },
  {
    id: "c2",
    name: "DEF College of Engineering",
    location: "Coimbatore, TN",
    established: 1988,
    type: "Government",
    students: 3850,
    faculty: 190,
    studentFacultyRatio: "20:1",
    passPercentage: 91.1,
    arrearRate: 8.9,
    averageCGPA: 8.4,
    placementRate: 85.2,
    highestPackage: "22 LPA",
    averagePackage: "6.9 LPA",
    achievements: ["Top Research Grant 2025"],
    departments: [
      { name: "CSE", students: 700, passPercentage: 96, arrear: 4, cgpa: 8.8, placement: 93 },
      { name: "MECH", students: 500, passPercentage: 89, arrear: 11, cgpa: 7.6, placement: 65 }
    ],
    yearlyPerformance: [
      { year: 2023, pass: 86.5, cgpa: 7.8 },
      { year: 2024, pass: 88.9, cgpa: 8.1 },
      { year: 2025, pass: 91.1, cgpa: 8.4 }
    ],
    grievanceStats: { total: 58, resolved: 50, pending: 8 }
  },
  {
    id: "c3",
    name: "GHI Institute",
    location: "Madurai, TN",
    established: 2002,
    type: "Private",
    students: 2100,
    faculty: 110,
    studentFacultyRatio: "19:1",
    passPercentage: 89.6,
    arrearRate: 10.4,
    averageCGPA: 7.98,
    placementRate: 72.4,
    highestPackage: "12 LPA",
    averagePackage: "4.2 LPA",
    achievements: ["Regional Coding Championship 2025"],
    departments: [
      { name: "CSE", students: 420, passPercentage: 92, arrear: 8, cgpa: 8.1, placement: 84 },
      { name: "IT", students: 300, passPercentage: 90, arrear: 10, cgpa: 7.9, placement: 78 }
    ],
    yearlyPerformance: [
      { year: 2023, pass: 85.1, cgpa: 7.5 },
      { year: 2024, pass: 87.6, cgpa: 7.8 },
      { year: 2025, pass: 89.6, cgpa: 7.98 }
    ],
    grievanceStats: { total: 20, resolved: 15, pending: 5 }
  }
];

export default { universityAnalytics, colleges };