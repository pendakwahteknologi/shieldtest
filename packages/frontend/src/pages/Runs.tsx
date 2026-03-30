import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Run { id: string; status: string; routerName: string | null; totalItems: number; completedItems: number; createdAt: string; completedAt: string | null; }
const statusColours: Record<string, string> = { pending: 'bg-gray-600/20 text-gray-400', running: 'bg-accent-blue/20 text-accent-blue', completed: 'bg-accent-green/20 text-accent-green', failed: 'bg-accent-red/20 text-accent-red' };

export default function Runs() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<{ data: Run[] }>('/runs').then((r) => setRuns(r.data)).finally(() => setLoading(false)); }, []);

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Benchmark Runs</h2>
      <div className="bg-surface-800 rounded-lg border border-surface-500 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-surface-500 text-gray-400"><th className="text-left p-3">Date</th><th className="text-left p-3">Router</th><th className="text-left p-3">Status</th><th className="text-left p-3">Progress</th><th className="p-3">Actions</th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id} className="border-b border-surface-600 hover:bg-surface-700">
              <td className="p-3 text-gray-300">{new Date(r.createdAt).toLocaleString('en-GB')}</td>
              <td className="p-3 text-gray-100">{r.routerName || '--'}</td>
              <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${statusColours[r.status] || ''}`}>{r.status}</span></td>
              <td className="p-3 text-gray-400">{r.completedItems}/{r.totalItems}</td>
              <td className="p-3 text-center"><Link to={`/runs/${r.id}`} className="text-accent-blue hover:underline text-xs">View</Link></td>
            </tr>
          ))}{runs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-500">No runs yet</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
