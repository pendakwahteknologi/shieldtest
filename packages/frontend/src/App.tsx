import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Profiles from './pages/Profiles';
import Runs from './pages/Runs';
import RunDetail from './pages/RunDetail';
import Probes from './pages/Probes';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="sources" element={<Sources />} />
        <Route path="profiles" element={<Profiles />} />
        <Route path="runs" element={<Runs />} />
        <Route path="runs/:id" element={<RunDetail />} />
        <Route path="probes" element={<Probes />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
