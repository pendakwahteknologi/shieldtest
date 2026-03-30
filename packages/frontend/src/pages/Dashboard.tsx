import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import ScoreGauge from '../components/ScoreGauge';
import CategoryBars from '../components/CategoryBars';

interface DashboardData {
  overallScore: number | null;
  letterGrade: string | null;
  latestRun: { id: string; routerName: string; completedAt: string } | null;
  trend: Array<{ overallScore: number; createdAt: string }>;
  stats: { totalIndicators: number; activeProbes: number };
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = () => api<{ data: DashboardData }>('/dashboard/overview').then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-surface-800 rounded-lg border border-surface-500 p-4">
          <ScoreGauge score={data?.overallScore ?? null} />
        </div>
        <div className="bg-surface-800 rounded-lg border border-surface-500 p-4 lg:col-span-2">
          <h3 className="text-sm text-gray-400 mb-3">Score Trend</h3>
          {data?.trend && data.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data.trend}>
                <XAxis dataKey="createdAt" tick={false} stroke="#3a4a6b" />
                <YAxis domain={[0, 100]} stroke="#3a4a6b" fontSize={12} />
                <Line type="monotone" dataKey="overallScore" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Tooltip contentStyle={{ backgroundColor: '#16213e', border: '1px solid #3a4a6b', borderRadius: '8px', color: '#e5e7eb' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-500 text-sm">No trend data yet</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500"><p className="text-sm text-gray-400">Total Indicators</p><p className="text-3xl font-bold text-gray-100 mt-1">{data?.stats?.totalIndicators ?? '--'}</p></div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500"><p className="text-sm text-gray-400">Active Probes</p><p className="text-3xl font-bold text-accent-green mt-1">{data?.stats?.activeProbes ?? '--'}</p></div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500"><p className="text-sm text-gray-400">Latest Run</p><p className="text-lg font-bold text-gray-100 mt-1">{data?.latestRun?.routerName ?? '--'}</p></div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500"><p className="text-sm text-gray-400">Last Completed</p><p className="text-lg font-bold text-gray-100 mt-1">{data?.latestRun?.completedAt ? new Date(data.latestRun.completedAt).toLocaleDateString('en-GB') : '--'}</p></div>
      </div>
      <div className="bg-surface-800 rounded-lg border border-surface-500 p-4">
        <h3 className="text-sm text-gray-400 mb-3">Category Pass Rates</h3>
        <CategoryBars data={data?.trend?.[data.trend.length - 1] as Record<string, number | null> ?? null} />
      </div>
    </div>
  );
}
