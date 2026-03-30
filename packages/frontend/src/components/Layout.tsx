import { Link, useLocation, Outlet } from 'react-router-dom';
import { api } from '../api/client';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '~' },
  { path: '/sources', label: 'Sources', icon: '~' },
  { path: '/profiles', label: 'Profiles', icon: '~' },
  { path: '/runs', label: 'Runs', icon: '~' },
  { path: '/probes', label: 'Probes', icon: '~' },
  { path: '/settings', label: 'Settings', icon: '~' },
];

export default function Layout() {
  const location = useLocation();

  const handleLogout = async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/shieldtest/login';
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-56 bg-surface-800 border-r border-surface-500 flex flex-col">
        <div className="p-4 border-b border-surface-500">
          <h1 className="text-lg font-bold text-accent-blue">ShieldTest</h1>
          <p className="text-xs text-gray-400">DNS Filtering Benchmark</p>
        </div>
        <div className="flex-1 py-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-4 py-2 text-sm transition-colors ${
                location.pathname === item.path
                  ? 'bg-surface-600 text-accent-blue border-r-2 border-accent-blue'
                  : 'text-gray-300 hover:bg-surface-700 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="p-4 border-t border-surface-500">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Log out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-surface-900 p-6">
        <Outlet />
      </main>
    </div>
  );
}
