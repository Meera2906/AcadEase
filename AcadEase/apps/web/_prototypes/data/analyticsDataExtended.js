export const universityAnalyticsExtended = {
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
  },
  monthlyAdmissions: [5200, 4800, 5000, 5300, 5400, 5600, 5900, 6100, 6200, 6300, 6400, 6600]
};

export const collegesExtended = [
  ...Array.from({ length: 12 }).map((_, i) => ({
    id: `ec${i + 1}`,
    name: `${['ABC','DEF','GHI','JKL','MNO','PQR','STU','VWX','YZA','BCD','EFG','HIJ'][i]} Institute of Technology`,
    location: ['Chennai, TN','Coimbatore, TN','Madurai, TN','Tiruchirappalli, TN','Salem, TN','Vellore, TN','Kanchipuram, TN','Erode, TN','Thoothukudi, TN','Tiruvarur, TN','Puducherry, PU','Bengaluru, KA'][i],
    established: 1985 + (i * 3),
    type: i % 3 === 0 ? 'Government' : 'Private',
    students: 1500 + i * 200,
    faculty: 80 + i * 10,
    studentFacultyRatio: `${Math.round((1500 + i * 200) / (80 + i * 10))}:1`,
    passPercentage: +(85 + Math.random() * 12).toFixed(1),
    arrearRate: +(5 + Math.random() * 15).toFixed(1),
    averageCGPA: +(7 + Math.random() * 2).toFixed(2),
    placementRate: +(60 + Math.random() * 35).toFixed(1),
    highestPackage: `${5 + Math.round(Math.random() * 30)} LPA`,
    averagePackage: `${2 + (Math.random() * 8).toFixed(1)} LPA`,
    achievements: [
      'Smart India Hackathon Winner 2026',
      'AI Research Grant 2025',
      'Regional Coding Championship 2024'
    ].slice(0, 1 + (i % 3)),
    departments: [
      { name: 'CSE', students: 400 + i * 10, passPercentage: +(88 + Math.random()*8).toFixed(1), arrear: +(2 + Math.random()*6).toFixed(1), cgpa: +(8 + Math.random()*1).toFixed(2), placement: +(80 + Math.random()*15).toFixed(0) },
      { name: 'ECE', students: 300 + i * 8, passPercentage: +(82 + Math.random()*10).toFixed(1), arrear: +(5 + Math.random()*10).toFixed(1), cgpa: +(7 + Math.random()*1.2).toFixed(2), placement: +(60 + Math.random()*25).toFixed(0) },
      { name: 'MECH', students: 200 + i * 5, passPercentage: +(78 + Math.random()*12).toFixed(1), arrear: +(6 + Math.random()*12).toFixed(1), cgpa: +(6.5 + Math.random()*1.5).toFixed(2), placement: +(40 + Math.random()*35).toFixed(0) }
    ],
    yearlyPerformance: [
      { year: 2023, pass: +(80 + Math.random()*12).toFixed(1), cgpa: +(6 + Math.random()*2).toFixed(2) },
      { year: 2024, pass: +(82 + Math.random()*10).toFixed(1), cgpa: +(6.5 + Math.random()*2).toFixed(2) },
      { year: 2025, pass: +(85 + Math.random()*10).toFixed(1), cgpa: +(7 + Math.random()*1.5).toFixed(2) }
    ],
    grievanceStats: { total: 10 + i * 3, resolved: 8 + i * 2, pending: 2 + i }
  }))
];

export default { universityAnalyticsExtended, collegesExtended };
