import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import CollegeAnalyticsV2 from './pages/CollegeAnalyticsV2.jsx';

function App() {
  return (
    <MemoryRouter initialEntries={["/superadmin/analytics/college/ec1"]}>
      <Routes>
        <Route path="/superadmin/analytics/college/:id" element={<CollegeAnalyticsV2 />} />
      </Routes>
    </MemoryRouter>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
