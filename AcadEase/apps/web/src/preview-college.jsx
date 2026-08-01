import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import CollegeAnalytics from './pages/CollegeAnalytics.jsx';

function App() {
  // default to college id c1 from mock data; change the path to c2 or c3 to preview others
  return (
    <MemoryRouter initialEntries={["/superadmin/analytics/college/c1"]}>
      <Routes>
        <Route path="/superadmin/analytics/college/:id" element={<CollegeAnalytics />} />
      </Routes>
    </MemoryRouter>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
