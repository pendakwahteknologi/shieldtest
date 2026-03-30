import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
interface VerdictChartProps { data: Record<string, number>; }
const COLOURS: Record<string, string> = { ALLOWED: '#22c55e', BLOCKED_NXDOMAIN: '#ef4444', BLOCKED_SINKHOLE: '#f97316', BLOCKED_BLOCKPAGE: '#eab308', TIMEOUT: '#6b7280', DNS_ERROR: '#9ca3af', UNKNOWN: '#4b5563' };

export default function VerdictChart({ data }: VerdictChartProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);
  if (chartData.length === 0) return <p className="text-gray-500 text-sm">No verdict data</p>;
  return (<ResponsiveContainer width="100%" height={200}><PieChart><Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>{chartData.map((e) => <Cell key={e.name} fill={COLOURS[e.name] || '#6b7280'} />)}</Pie><Tooltip contentStyle={{ backgroundColor: '#16213e', border: '1px solid #3a4a6b', borderRadius: '8px', color: '#e5e7eb' }} /></PieChart></ResponsiveContainer>);
}
