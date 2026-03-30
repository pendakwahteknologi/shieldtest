import { useState, useEffect } from 'react';
import { api } from '../api/client';

const defaultWeights = { malware: 0.35, phishing: 0.25, adult: 0.15, adsTracker: 0.10, clean: 0.10, consistency: 0.05 };

export default function Settings() {
  const [weights, setWeights] = useState(defaultWeights);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ data: Record<string, unknown> }>('/settings').then((r) => {
      if (r.data.scoringWeights) setWeights(r.data.scoringWeights as typeof defaultWeights);
    }).catch(() => {});
  }, []);

  const save = async () => {
    await api('/settings', { method: 'PUT', body: { scoringWeights: weights } });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <div className="bg-surface-800 rounded-lg border border-surface-500 p-6 max-w-lg">
        <h3 className="text-lg font-bold text-gray-100 mb-4">Scoring Weights</h3>
        {Object.entries(weights).map(([key, val]) => (
          <label key={key} className="flex justify-between items-centre mb-3">
            <span className="text-sm text-gray-300 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
            <input type="number" step="0.01" min="0" max="1" value={val} onChange={(e) => setWeights({...weights, [key]: +e.target.value})} className="w-20 px-2 py-1 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm text-right" />
          </label>
        ))}
        <div className="mt-4 flex items-centre gap-3">
          <button onClick={save} className="px-4 py-2 bg-accent-blue text-white rounded text-sm hover:bg-blue-600">Save</button>
          {saved && <span className="text-sm text-accent-green">Saved!</span>}
        </div>
      </div>
    </div>
  );
}
