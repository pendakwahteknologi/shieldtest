import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="sources" element={<div className="text-gray-400">Sources — coming soon</div>} />
        <Route path="profiles" element={<div className="text-gray-400">Benchmark Profiles — coming soon</div>} />
        <Route path="runs" element={<div className="text-gray-400">Runs — coming soon</div>} />
        <Route path="probes" element={<div className="text-gray-400">Probes — coming soon</div>} />
        <Route path="settings" element={<div className="text-gray-400">Settings — coming soon</div>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
