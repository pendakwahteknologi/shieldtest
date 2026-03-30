import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Source { id: string; name: string; type: string; enabled: boolean; refreshIntervalMins: number; lastSyncedAt: string | null; }

export default function Sources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = () => api<{ data: Source[] }>('/sources').then((r) => setSources(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const triggerSync = async (id: string) => {
    setSyncing(id);
    try { await api('/sources/' + id + '/sync', { method: 'POST' }); } catch {}
    setSyncing(null);
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await api('/sources/' + id, { method: 'PUT', body: { enabled: !enabled } });
    load();
  };

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Sources</h2>
      <div className="bg-surface-800 rounded-lg border border-surface-500 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-surface-500 text-gray-400"><th className="text-left p-3">Name</th><th className="text-left p-3">Type</th><th className="text-left p-3">Status</th><th className="text-left p-3">Last Synced</th><th className="text-left p-3">Refresh</th><th className="p-3">Actions</th></tr></thead>
          <tbody>{sources.map((s) => (
            <tr key={s.id} className="border-b border-surface-600 hover:bg-surface-700">
              <td className="p-3 text-gray-100 font-medium">{s.name}</td>
              <td className="p-3 text-gray-300">{s.type}</td>
              <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${s.enabled ? 'bg-accent-green/20 text-accent-green' : 'bg-gray-600/20 text-gray-400'}`}>{s.enabled ? 'Enabled' : 'Disabled'}</span></td>
              <td className="p-3 text-gray-400">{s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString('en-GB') : 'Never'}</td>
              <td className="p-3 text-gray-400">{s.refreshIntervalMins}m</td>
              <td className="p-3 text-center space-x-2">
                <button onClick={() => triggerSync(s.id)} disabled={syncing === s.id} className="px-2 py-1 bg-accent-blue/20 text-accent-blue rounded text-xs hover:bg-accent-blue/30 disabled:opacity-50">{syncing === s.id ? 'Syncing...' : 'Sync'}</button>
                <button onClick={() => toggleEnabled(s.id, s.enabled)} className="px-2 py-1 bg-surface-600 text-gray-300 rounded text-xs hover:bg-surface-500">{s.enabled ? 'Disable' : 'Enable'}</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
