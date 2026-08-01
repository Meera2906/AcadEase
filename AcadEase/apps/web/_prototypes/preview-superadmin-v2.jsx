import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import SuperAdminAnalyticsV2 from './pages/SuperAdminAnalyticsV2.jsx';

function App() {
  return (
    <MemoryRouter initialEntries={["/preview/superadmin-v2"]}>
      <Routes>
        <Route path="/preview/superadmin-v2" element={<SuperAdminAnalyticsV2 />} />
      </Routes>
    </MemoryRouter>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
