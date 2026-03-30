import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

interface Run { id: string; status: string; routerName: string | null; resolverMode: string | null; totalItems: number; completedItems: number; createdAt: string; completedAt: string | null; }
interface Profile { id: string; name: string; sampleSizePerCategory: number; }
interface Probe { id: string; name: string; status: string; }

const statusColours: Record<string, string> = { pending: 'bg-gray-600/20 text-gray-400', running: 'bg-accent-blue/20 text-accent-blue', completed: 'bg-accent-green/20 text-accent-green', failed: 'bg-accent-red/20 text-accent-red' };

export default function Runs() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [probes, setProbes] = useState<Probe[]>([]);
  const [form, setForm] = useState({ profileId: '', probeId: '', routerName: '', firmwareVersion: '', resolverMode: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const loadRuns = () => api<{ data: Run[] }>('/runs').then((r) => setRuns(r.data)).finally(() => setLoading(false));

  useEffect(() => { loadRuns(); }, []);

  // Auto-refresh when any run is in progress
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'running' || r.status === 'pending');
    if (!hasActive) return;
    const interval = setInterval(loadRuns, 5000);
    return () => clearInterval(interval);
  }, [runs]);

  const openForm = async () => {
    const [profileRes, probeRes] = await Promise.all([
      api<{ data: Profile[] }>('/benchmark-profiles'),
      api<{ data: Probe[] }>('/probes'),
    ]);
    setProfiles(profileRes.data);
    // Sort probes: online first, then by name
    const sortedProbes = [...probeRes.data].sort((a, b) => {
      if (a.status === 'online' && b.status !== 'online') return -1;
      if (a.status !== 'online' && b.status === 'online') return 1;
      return a.name.localeCompare(b.name);
    });
    setProbes(sortedProbes);
    if (profileRes.data.length > 0) setForm((f) => ({ ...f, profileId: profileRes.data[0].id }));
    if (sortedProbes.length > 0) setForm((f) => ({ ...f, probeId: sortedProbes[0].id }));
    setShowForm(true);
    setError('');
  };

  const createRun = async () => {
    if (!form.profileId || !form.probeId) { setError('Please select a profile and probe'); return; }
    setCreating(true);
    setError('');
    try {
      const r = await api<{ data: { runId: string; totalItems: number } }>('/runs', { method: 'POST', body: form });
      setShowForm(false);
      loadRuns();
      navigate(`/runs/${r.data.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create run');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Benchmark Runs</h2>
        <button onClick={openForm} className="px-4 py-2 bg-accent-blue text-white rounded text-sm hover:bg-blue-600">
          New Run
        </button>
      </div>

      {/* New Run Form */}
      {showForm && (
        <div className="bg-surface-800 rounded-lg border border-surface-500 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Start a New Benchmark</h3>

          {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-sm text-red-300">{error}</div>}

          {profiles.length === 0 && (
            <div className="mb-4 p-3 bg-accent-yellow/10 border border-accent-yellow/30 rounded text-sm text-accent-yellow">
              No benchmark profiles found. <Link to="/profiles" className="underline">Create one first</Link>.
            </div>
          )}

          {probes.length === 0 && (
            <div className="mb-4 p-3 bg-accent-yellow/10 border border-accent-yellow/30 rounded text-sm text-accent-yellow">
              No probes registered. <Link to="/probes" className="underline">Register a probe first</Link>.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-gray-300">Benchmark Profile</span>
              <select value={form.profileId} onChange={(e) => setForm({ ...form, profileId: e.target.value })}
                className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm">
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sampleSizePerCategory}/category)</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-gray-300">Probe Agent</span>
              <select value={form.probeId} onChange={(e) => setForm({ ...form, probeId: e.target.value })}
                className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm">
                {probes.map((p) => <option key={p.id} value={p.id}>{p.status === 'online' ? '● ' : '○ '}{p.name} ({p.status})</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-gray-300">Router / Device Name</span>
              <input value={form.routerName} onChange={(e) => setForm({ ...form, routerName: e.target.value })}
                placeholder="e.g. FortiGate 60F, Home Router"
                className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm" />
            </label>

            <label className="block">
              <span className="text-sm text-gray-300">Resolver / DNS Mode</span>
              <input value={form.resolverMode} onChange={(e) => setForm({ ...form, resolverMode: e.target.value })}
                placeholder="e.g. Default DNS, Pi-hole, NextDNS"
                className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm" />
            </label>

            <label className="block">
              <span className="text-sm text-gray-300">Firmware Version (optional)</span>
              <input value={form.firmwareVersion} onChange={(e) => setForm({ ...form, firmwareVersion: e.target.value })}
                placeholder="e.g. v7.4.1"
                className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm" />
            </label>

            <label className="block">
              <span className="text-sm text-gray-300">Notes (optional)</span>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Testing after enabling web filter"
                className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm" />
            </label>
          </div>

          <div className="mt-4 flex gap-3">
            <button onClick={createRun} disabled={creating || profiles.length === 0 || probes.length === 0}
              className="px-4 py-2 bg-accent-blue text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50">
              {creating ? 'Starting...' : 'Start Benchmark'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-surface-600 text-gray-300 rounded text-sm hover:bg-surface-500">
              Cancel
            </button>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Make sure your probe is running on the device behind the network you want to test. The probe will pick up the job automatically.
          </p>
        </div>
      )}

      {/* Runs Table */}
      <div className="bg-surface-800 rounded-lg border border-surface-500 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-500 text-gray-400">
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Router</th>
              <th className="text-left p-3">DNS</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Progress</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id} className="border-b border-surface-600 hover:bg-surface-700">
              <td className="p-3 text-gray-300">{new Date(r.createdAt).toLocaleString('en-GB')}</td>
              <td className="p-3 text-gray-100">{r.routerName || '--'}</td>
              <td className="p-3 text-gray-400 text-xs">{r.resolverMode || '--'}</td>
              <td className="p-3">
                <span className={`px-2 py-0.5 rounded text-xs ${statusColours[r.status] || ''}`}>{r.status}</span>
                {r.status === 'running' && <span className="ml-2 text-xs text-accent-blue animate-pulse">testing...</span>}
              </td>
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-surface-600 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-blue rounded-full transition-all" style={{ width: `${r.totalItems > 0 ? (r.completedItems / r.totalItems) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs text-gray-400">{r.completedItems}/{r.totalItems}</span>
                </div>
              </td>
              <td className="p-3 text-center"><Link to={`/runs/${r.id}`} className="text-accent-blue hover:underline text-xs">View</Link></td>
            </tr>
          ))}{runs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No benchmark runs yet. Click "New Run" to start testing.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
