import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Probe { id: string; name: string; status: string; ipAddress: string | null; lastHeartbeatAt: string | null; }

export default function Probes() {
  const [probes, setProbes] = useState<Probe[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newToken, setNewToken] = useState<{ probeId: string; token: string } | null>(null);

  const load = () => api<{ data: Probe[] }>('/probes').then((r) => setProbes(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const register = async () => {
    if (!newName) return;
    const r = await api<{ data: { probeId: string; token: string } }>('/probes/register', { method: 'POST', body: { name: newName } });
    setNewToken(r.data); setNewName(''); load();
  };

  const remove = async (id: string) => { await api('/probes/' + id, { method: 'DELETE' }); load(); };

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Probe Agents</h2>

      {/* Setup Guide */}
      <div className="bg-surface-800 rounded-lg border border-surface-500 p-5 mb-6">
        <h3 className="text-sm font-medium text-accent-blue mb-3">How to Set Up a Probe</h3>
        <p className="text-sm text-gray-300 mb-4">
          A probe runs on any device (PC, Mac, laptop) connected to the network you want to test.
          It performs DNS lookups through that network's router and reports back whether threats are blocked.
        </p>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Step 1 — Install Node.js (if not already installed)</p>
            <div className="bg-surface-900 rounded p-3 text-xs font-mono text-gray-200 space-y-1">
              <p className="text-gray-500"># macOS (using Homebrew)</p>
              <p>brew install node</p>
              <p className="text-gray-500 mt-2"># Windows — download from https://nodejs.org</p>
              <p className="text-gray-500"># Linux (Ubuntu/Debian)</p>
              <p>sudo apt install nodejs npm</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Step 2 — Download the probe from GitHub</p>
            <div className="relative">
              <pre className="bg-surface-900 rounded p-3 text-xs font-mono text-gray-200 overflow-x-auto">git clone https://github.com/pendakwahteknologi/shieldtest.git{'\n'}cd shieldtest/packages/probe{'\n'}npm install</pre>
              <button onClick={() => navigator.clipboard.writeText('git clone https://github.com/pendakwahteknologi/shieldtest.git\ncd shieldtest/packages/probe\nnpm install')} className="absolute top-2 right-2 px-2 py-1 bg-surface-600 text-gray-300 rounded text-xs hover:bg-surface-500">Copy</button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Step 3 — Register a probe below and copy the .env config</p>
            <p className="text-xs text-gray-500">Register a new probe, then paste the generated config into a file called <code className="text-gray-300">.env</code> in the probe folder.</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Step 4 — Run the probe</p>
            <div className="relative">
              <pre className="bg-surface-900 rounded p-3 text-xs font-mono text-gray-200 overflow-x-auto">npx tsx src/index.ts</pre>
              <button onClick={() => navigator.clipboard.writeText('npx tsx src/index.ts')} className="absolute top-2 right-2 px-2 py-1 bg-surface-600 text-gray-300 rounded text-xs hover:bg-surface-500">Copy</button>
            </div>
            <p className="text-xs text-gray-500 mt-1">The probe will wait for a benchmark job. Start a run from the Runs page and the probe will automatically test domains and exit when complete.</p>
          </div>
        </div>
      </div>

      {/* Register */}
      <div className="bg-surface-800 rounded-lg border border-surface-500 p-4 mb-6">
        <h3 className="text-sm text-gray-400 mb-3">Register New Probe</h3>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Probe name" className="flex-1 px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm" />
          <button onClick={register} className="px-4 py-2 bg-accent-blue text-white rounded text-sm hover:bg-blue-600">Register</button>
        </div>
        {newToken && (
          <div className="mt-3 p-3 bg-surface-700 rounded border border-accent-blue">
            <p className="text-sm text-accent-blue font-bold mb-2">Probe registered! Save these details — the token is shown only once.</p>
            <p className="text-xs text-gray-400 mb-1">Copy and paste this into <code>packages/probe/.env</code>:</p>
            <div className="relative">
              <pre className="text-xs text-gray-100 bg-surface-900 p-3 rounded overflow-x-auto select-all">{`SERVER_URL=https://my6.my/shieldtest/api
PROBE_ID=${newToken.probeId}
PROBE_TOKEN=${newToken.token}
DNS_ONLY=true
POLL_INTERVAL_MS=3000
HEARTBEAT_INTERVAL_MS=15000`}</pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`SERVER_URL=https://my6.my/shieldtest/api\nPROBE_ID=${newToken.probeId}\nPROBE_TOKEN=${newToken.token}\nDNS_ONLY=true\nPOLL_INTERVAL_MS=3000\nHEARTBEAT_INTERVAL_MS=15000`);
                }}
                className="absolute top-2 right-2 px-2 py-1 bg-surface-600 text-gray-300 rounded text-xs hover:bg-surface-500"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-3">{probes.map((p) => (
        <div key={p.id} className="bg-surface-800 rounded-lg border border-surface-500 p-4 flex justify-between items-centre">
          <div>
            <h3 className="font-bold text-gray-100">{p.name}</h3>
            <div className="flex gap-4 text-xs text-gray-400 mt-1">
              <span className={p.status === 'online' ? 'text-accent-green' : 'text-gray-500'}>{p.status}</span>
              <span>IP: {p.ipAddress || '--'}</span>
              <span>Heartbeat: {p.lastHeartbeatAt ? new Date(p.lastHeartbeatAt).toLocaleString('en-GB') : 'Never'}</span>
            </div>
          </div>
          <button onClick={() => remove(p.id)} className="px-2 py-1 bg-accent-red/20 text-accent-red rounded text-xs hover:bg-accent-red/30">Delete</button>
        </div>
      ))}{probes.length === 0 && <p className="text-gray-500">No probes registered.</p>}</div>
    </div>
  );
}
