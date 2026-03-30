interface CategoryBarsProps { data: Record<string, number | null> | null; }
const categories = [
  { key: 'malwareBlockRate', label: 'Malware', colour: 'bg-accent-red' },
  { key: 'phishingBlockRate', label: 'Phishing', colour: 'bg-accent-orange' },
  { key: 'adultFilterRate', label: 'Adult', colour: 'bg-purple-500' },
  { key: 'adsTrackerBlockRate', label: 'Ads/Trackers', colour: 'bg-accent-yellow' },
  { key: 'cleanAllowRate', label: 'Clean (Allow)', colour: 'bg-accent-green' },
];

export default function CategoryBars({ data }: CategoryBarsProps) {
  if (!data) return <p className="text-gray-500 text-sm">No data available</p>;
  return (<div className="space-y-3">{categories.map((cat) => {
    const value = data[cat.key]; const pct = value !== null && value !== undefined ? Math.round(value * 100) : 0;
    return (<div key={cat.key}><div className="flex justify-between text-sm mb-1"><span className="text-gray-300">{cat.label}</span><span className="text-gray-400">{pct}%</span></div><div className="h-2 bg-surface-600 rounded-full overflow-hidden"><div className={`h-full ${cat.colour} rounded-full transition-all`} style={{ width: `${pct}%` }} /></div></div>);
  })}</div>);
}
