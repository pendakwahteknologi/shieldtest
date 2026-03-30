import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import VerdictChart from '../components/VerdictChart';

interface RunData { id: string; status: string; routerName: string | null; firmwareVersion: string | null; resolverMode: string | null; totalItems: number; completedItems: number; startedAt: string | null; completedAt: string | null; }
interface Scorecard { overallScore: number | null; malwareBlockRate: number | null; phishingBlockRate: number | null; adultFilterRate: number | null; adsTrackerBlockRate: number | null; cleanAllowRate: number | null; }
interface RunItem { hostname: string; category: string; verdict: string | null; latencyMs: number | null; }

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunData | null>(null);
  const [score, setScore] = useState<Scorecard | null>(null);
  const [items, setItems] = useState<RunItem[]>([]);

  useEffect(() => {
    if (!id) return;
    api<{ data: RunData }>(`/runs/${id}`).then((r) => setRun(r.data)).catch(() => {});
    api<{ data: Scorecard }>(`/runs/${id}/score`).then((r) => setScore(r.data)).catch(() => {});
    api<{ data: RunItem[] }>(`/runs/${id}/results?limit=200`).then((r) => setItems(r.data)).catch(() => {});
  }, [id]);

  if (!run) return <p className="text-gray-400">Loading...</p>;

  const verdictCounts: Record<string, number> = {};
  items.forEach((i) => { if (i.verdict) verdictCounts[i.verdict] = (verdictCounts[i.verdict] || 0) + 1; });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Run Detail</h2>
      <div className="flex gap-4 text-sm text-gray-400 mb-6">
        <span>Router: {run.routerName || '--'}</span><span>Firmware: {run.firmwareVersion || '--'}</span><span>Resolver: {run.resolverMode || '--'}</span><span className={run.status === 'completed' ? 'text-accent-green' : 'text-accent-blue'}>{run.status}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {score && <div className="bg-surface-800 rounded-lg border border-surface-500 p-4">
          <h3 className="text-sm text-gray-400 mb-3">Scorecard</h3>
          <p className="text-4xl font-bold text-accent-blue">{score.overallScore !== null ? Math.round(score.overallScore) : '--'}</p>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Malware Block</span><span className="text-gray-200">{score.malwareBlockRate !== null ? (score.malwareBlockRate * 100).toFixed(1) + '%' : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Phishing Block</span><span className="text-gray-200">{score.phishingBlockRate !== null ? (score.phishingBlockRate * 100).toFixed(1) + '%' : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Adult Filter</span><span className="text-gray-200">{score.adultFilterRate !== null ? (score.adultFilterRate * 100).toFixed(1) + '%' : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Ads/Tracker Block</span><span className="text-gray-200">{score.adsTrackerBlockRate !== null ? (score.adsTrackerBlockRate * 100).toFixed(1) + '%' : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Clean Allow</span><span className="text-gray-200">{score.cleanAllowRate !== null ? (score.cleanAllowRate * 100).toFixed(1) + '%' : '--'}</span></div>
          </div>
        </div>}
        <div className="bg-surface-800 rounded-lg border border-surface-500 p-4">
          <h3 className="text-sm text-gray-400 mb-3">Verdict Distribution</h3>
          <VerdictChart data={verdictCounts} />
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <a href={`/shieldtest/api/reports/${id}.csv`} className="px-3 py-1.5 bg-surface-700 text-gray-300 rounded text-sm hover:bg-surface-600">Export CSV</a>
        <a href={`/shieldtest/api/reports/${id}.json`} className="px-3 py-1.5 bg-surface-700 text-gray-300 rounded text-sm hover:bg-surface-600">Export JSON</a>
      </div>
      <div className="bg-surface-800 rounded-lg border border-surface-500 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-surface-500 text-gray-400"><th className="text-left p-3">Hostname</th><th className="text-left p-3">Category</th><th className="text-left p-3">Verdict</th><th className="text-left p-3">Latency</th></tr></thead>
          <tbody>{items.map((i, idx) => (
            <tr key={idx} className="border-b border-surface-600 hover:bg-surface-700">
              <td className="p-3 text-gray-100 font-mono text-xs">{i.hostname}</td>
              <td className="p-3 text-gray-300">{i.category}</td>
              <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${i.verdict?.startsWith('BLOCKED') ? 'bg-accent-red/20 text-accent-red' : i.verdict === 'ALLOWED' ? 'bg-accent-green/20 text-accent-green' : 'bg-gray-600/20 text-gray-400'}`}>{i.verdict || 'pending'}</span></td>
              <td className="p-3 text-gray-400">{i.latencyMs ? i.latencyMs + 'ms' : '--'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
