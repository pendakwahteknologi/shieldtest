export default function Dashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500">
          <p className="text-sm text-gray-400">Overall Score</p>
          <p className="text-3xl font-bold text-accent-blue mt-1">--</p>
        </div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500">
          <p className="text-sm text-gray-400">Total Indicators</p>
          <p className="text-3xl font-bold text-gray-100 mt-1">--</p>
        </div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500">
          <p className="text-sm text-gray-400">Active Probes</p>
          <p className="text-3xl font-bold text-accent-green mt-1">--</p>
        </div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500">
          <p className="text-sm text-gray-400">Last Sync</p>
          <p className="text-3xl font-bold text-gray-100 mt-1">--</p>
        </div>
      </div>
      <p className="mt-8 text-gray-500 text-sm">
        Configure sources and run your first benchmark to see results here.
      </p>
    </div>
  );
}
