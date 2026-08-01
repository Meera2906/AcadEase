import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import SuperAdminAnalytics from './pages/SuperAdminAnalytics.jsx';

function App() {
  return (
    <MemoryRouter initialEntries={["/superadmin/analytics"]}>
      <Routes>
        <Route path="/superadmin/analytics" element={<SuperAdminAnalytics />} />
      </Routes>
    </MemoryRouter>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
