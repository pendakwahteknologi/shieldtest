import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Source { id: string; name: string; type: string; url: string; enabled: boolean; refreshIntervalMins: number; lastSyncedAt: string | null; }
interface SyncRun { id: string; sourceId: string; status: string; recordsFetched: number; recordsAdded: number; recordsSkipped: number; errorsJson: Array<{ line: number; raw: string; reason: string }> | null; startedAt: string; completedAt: string | null; }
interface IndicatorStats { [key: string]: number; }

export default function Sources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [stats, setStats] = useState<IndicatorStats>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const load = async () => {
    const [srcRes, runRes, statRes] = await Promise.all([
      api<{ data: Source[] }>('/sources'),
      api<{ data: SyncRun[] }>('/sources/sync-runs?limit=50'),
      api<{ data: IndicatorStats }>('/indicators/stats'),
    ]);
    setSources(srcRes.data);
    setSyncRuns(runRes.data);
    setStats(statRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const triggerSync = async (id: string) => {
    setSyncing(id);
    try { await api('/sources/' + id + '/sync', { method: 'POST' }); } catch {}
    setSyncing(null);
    setTimeout(load, 3000);
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await api('/sources/' + id, { method: 'PUT', body: { enabled: !enabled } });
    load();
  };

  const getLatestSync = (sourceId: string): SyncRun | undefined => {
    return syncRuns.find((r) => r.sourceId === sourceId);
  };

  const getSourceRuns = (sourceId: string): SyncRun[] => {
    return syncRuns.filter((r) => r.sourceId === sourceId).slice(0, 5);
  };

  const categoryForSource = (name: string): string => {
    const map: Record<string, string> = {
      urlhaus: 'malware', openphish: 'phishing', phishtank: 'phishing',
      tranco: 'clean', 'stevenblack-ads': 'ads', 'stevenblack-adult': 'adult',
      feodo: 'c2', threatfox: 'c2', coinblocker: 'cryptomining',
    };
    return map[name] || name;
  };

  const syncStatusBadge = (status: string) => {
    const colours: Record<string, string> = {
      completed: 'bg-accent-green/20 text-accent-green',
      running: 'bg-accent-blue/20 text-accent-blue',
      failed: 'bg-accent-red/20 text-accent-red',
    };
    return <span className={`px-2 py-0.5 rounded text-xs ${colours[status] || 'bg-gray-600/20 text-gray-400'}`}>{status}</span>;
  };

  if (loading) return <p className="text-gray-400">Loading...</p>;

  const totalIndicators = Object.values(stats).reduce((sum, n) => sum + n, 0);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Sources</h2>
      <p className="text-sm text-gray-400 mb-6">{totalIndicators.toLocaleString()} total indicators across {Object.keys(stats).length} categories</p>

      {/* Indicator stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
          <div key={cat} className="bg-surface-800 rounded-lg border border-surface-500 p-3 text-center">
            <p className="text-lg font-bold text-gray-100">{count.toLocaleString()}</p>
            <p className="text-xs text-gray-400 capitalize">{cat}</p>
          </div>
        ))}
      </div>

      {/* Sources table */}
      <div className="space-y-3">
        {sources.map((s) => {
          const latest = getLatestSync(s.id);
          const cat = categoryForSource(s.name);
          const indicatorCount = stats[cat] || 0;
          const isExpanded = expandedSource === s.id;

          return (
            <div key={s.id} className="bg-surface-800 rounded-lg border border-surface-500 overflow-hidden">
              <div className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-100">{s.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs ${s.enabled ? 'bg-accent-green/20 text-accent-green' : 'bg-gray-600/20 text-gray-400'}`}>
                      {s.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {latest && syncStatusBadge(latest.status)}
                  </div>
                  <div className="flex gap-4 text-xs text-gray-400 mt-1">
                    <span>Type: {s.type}</span>
                    <span>Category: {cat}</span>
                    <span>{indicatorCount.toLocaleString()} indicators</span>
                    <span>Refresh: every {s.refreshIntervalMins >= 1440 ? `${Math.round(s.refreshIntervalMins / 1440)}d` : `${s.refreshIntervalMins / 60}h`}</span>
                    <span>Last synced: {s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString('en-GB') : 'Never'}</span>
                  </div>
                  {latest?.status === 'failed' && latest.errorsJson && (
                    <div className="mt-2 p-2 bg-accent-red/10 border border-accent-red/20 rounded text-xs text-accent-red">
                      Last sync failed: {latest.errorsJson[0]?.reason || 'Unknown error'}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setExpandedSource(isExpanded ? null : s.id)} className="px-2 py-1 bg-surface-600 text-gray-300 rounded text-xs hover:bg-surface-500">
                    {isExpanded ? 'Hide History' : 'History'}
                  </button>
                  <button onClick={() => triggerSync(s.id)} disabled={syncing === s.id || !s.enabled} className="px-2 py-1 bg-accent-blue/20 text-accent-blue rounded text-xs hover:bg-accent-blue/30 disabled:opacity-50">
                    {syncing === s.id ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button onClick={() => toggleEnabled(s.id, s.enabled)} className="px-2 py-1 bg-surface-600 text-gray-300 rounded text-xs hover:bg-surface-500">
                    {s.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              {/* Sync History */}
              {isExpanded && (
                <div className="border-t border-surface-600 p-4">
                  <h4 className="text-xs text-gray-400 mb-2">Recent Sync History</h4>
                  {getSourceRuns(s.id).length === 0 ? (
                    <p className="text-xs text-gray-500">No sync history yet</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead><tr className="text-gray-500"><th className="text-left py-1">Date</th><th className="text-left py-1">Status</th><th className="text-left py-1">Fetched</th><th className="text-left py-1">Added</th><th className="text-left py-1">Skipped</th><th className="text-left py-1">Errors</th></tr></thead>
                      <tbody>{getSourceRuns(s.id).map((r) => (
                        <tr key={r.id} className="text-gray-300">
                          <td className="py-1">{new Date(r.startedAt).toLocaleString('en-GB')}</td>
                          <td className="py-1">{syncStatusBadge(r.status)}</td>
                          <td className="py-1">{r.recordsFetched}</td>
                          <td className="py-1">{r.recordsAdded}</td>
                          <td className="py-1">{r.recordsSkipped}</td>
                          <td className="py-1">
                            {r.errorsJson && r.errorsJson.length > 0 ? (
                              <span className="text-accent-red">{r.errorsJson.length} error{r.errorsJson.length > 1 ? 's' : ''}</span>
                            ) : '--'}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                  <p className="text-xs text-gray-500 mt-2 break-all">Feed URL: {s.url}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
