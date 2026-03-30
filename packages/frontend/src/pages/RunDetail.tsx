import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import VerdictChart from '../components/VerdictChart';

interface RunData { id: string; status: string; routerName: string | null; firmwareVersion: string | null; resolverMode: string | null; totalItems: number; completedItems: number; startedAt: string | null; completedAt: string | null; profileId: string; probeId: string | null; }
interface Scorecard { overallScore: number | null; malwareBlockRate: number | null; phishingBlockRate: number | null; adultFilterRate: number | null; adsTrackerBlockRate: number | null; cleanAllowRate: number | null; consistencyScore: number | null; latencyPenalty: number | null; }
interface RunItem { hostname: string; category: string; verdict: string | null; latencyMs: number | null; evidenceJson: Record<string, unknown> | null; }
interface DohBypassEntry { provider: string; can_bypass: boolean; addresses: string[]; duration_ms: number; }

type FilterTab = 'all' | 'failures' | 'blocked' | 'allowed';

function getLetterGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function getGradeColour(grade: string): string {
  const map: Record<string, string> = { A: 'text-accent-green', B: 'text-accent-blue', C: 'text-accent-yellow', D: 'text-accent-orange', F: 'text-accent-red' };
  return map[grade] || 'text-gray-400';
}

function getGradeBg(grade: string): string {
  const map: Record<string, string> = { A: 'bg-accent-green/10 border-accent-green/30', B: 'bg-accent-blue/10 border-accent-blue/30', C: 'bg-accent-yellow/10 border-accent-yellow/30', D: 'bg-accent-orange/10 border-accent-orange/30', F: 'bg-accent-red/10 border-accent-red/30' };
  return map[grade] || '';
}

function verdictLabel(verdict: string): string {
  const labels: Record<string, string> = {
    ALLOWED: 'Allowed (Not Blocked)',
    BLOCKED_NXDOMAIN: 'Blocked (DNS)',
    BLOCKED_SINKHOLE: 'Blocked (Sinkhole)',
    BLOCKED_BLOCKPAGE: 'Blocked (Block Page)',
    TIMEOUT: 'Timed Out',
    DNS_ERROR: 'DNS Error',
    TLS_ERROR: 'TLS Error',
    NETWORK_ERROR: 'Network Error',
    UNKNOWN: 'Unknown',
  };
  return labels[verdict] || verdict;
}

function verdictStyle(verdict: string | null): string {
  if (!verdict) return 'bg-gray-600/20 text-gray-400';
  if (verdict.startsWith('BLOCKED')) return 'bg-accent-green/20 text-accent-green';
  if (verdict === 'ALLOWED') return 'bg-accent-red/20 text-accent-red';
  return 'bg-accent-yellow/20 text-accent-yellow';
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = { malware: 'Malware', phishing: 'Phishing', adult: 'Adult Content', ads: 'Ads', tracker: 'Trackers', clean: 'Clean (Safe)', c2: 'Command & Control', cryptomining: 'Cryptomining' };
  return labels[cat] || cat;
}

function rateBar(label: string, rate: number | null, description: string, isClean = false) {
  const pct = rate !== null ? Math.round(rate * 100) : 0;
  const isGood = isClean ? pct >= 95 : pct >= 80;
  const isBad = isClean ? pct < 80 : pct < 50;
  const colour = isGood ? 'bg-accent-green' : isBad ? 'bg-accent-red' : 'bg-accent-yellow';
  const textColour = isGood ? 'text-accent-green' : isBad ? 'text-accent-red' : 'text-accent-yellow';

  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1">
        <div>
          <span className="text-sm text-gray-200 font-medium">{label}</span>
          <span className="text-xs text-gray-500 ml-2">{description}</span>
        </div>
        <span className={`text-lg font-bold ${textColour}`}>{pct}%</span>
      </div>
      <div className="h-3 bg-surface-600 rounded-full overflow-hidden">
        <div className={`h-full ${colour} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunData | null>(null);
  const [score, setScore] = useState<Scorecard | null>(null);
  const [items, setItems] = useState<RunItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>('failures');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<{ data: RunData }>(`/runs/${id}`).then((r) => setRun(r.data)).catch(() => {});
    api<{ data: Scorecard }>(`/runs/${id}/score`).then((r) => setScore(r.data)).catch(() => {});
    api<{ data: RunItem[] }>(`/runs/${id}/results?limit=200`).then((r) => setItems(r.data)).catch(() => {});
  }, [id]);

  const runAgain = async () => {
    if (!run) return;
    setRerunning(true);
    try {
      const r = await api<{ data: { runId: string } }>('/runs', {
        method: 'POST',
        body: { profileId: run.profileId, probeId: run.probeId, routerName: run.routerName, firmwareVersion: run.firmwareVersion, resolverMode: run.resolverMode, notes: `Re-run of ${run.id}` },
      });
      navigate(`/runs/${r.data.runId}`);
    } catch { setRerunning(false); }
  };

  if (!run) return <p className="text-gray-400">Loading...</p>;

  // Compute stats
  const verdictCounts: Record<string, number> = {};
  const categoryCounts: Record<string, { total: number; blocked: number; allowed: number; errors: number }> = {};

  items.forEach((i) => {
    if (i.verdict) verdictCounts[i.verdict] = (verdictCounts[i.verdict] || 0) + 1;

    if (!categoryCounts[i.category]) categoryCounts[i.category] = { total: 0, blocked: 0, allowed: 0, errors: 0 };
    categoryCounts[i.category].total++;
    if (i.verdict?.startsWith('BLOCKED')) categoryCounts[i.category].blocked++;
    else if (i.verdict === 'ALLOWED') categoryCounts[i.category].allowed++;
    else if (i.verdict) categoryCounts[i.category].errors++;
  });

  const blockedCount = items.filter((i) => i.verdict?.startsWith('BLOCKED')).length;
  const allowedCount = items.filter((i) => i.verdict === 'ALLOWED').length;
  const errorCount = items.filter((i) => i.verdict && !i.verdict.startsWith('BLOCKED') && i.verdict !== 'ALLOWED').length;

  // Extract DoH bypass data from evidence
  const dohBypassResults: Array<{ hostname: string; entries: DohBypassEntry[] }> = [];
  for (const item of items) {
    const evidence = item.evidenceJson as Record<string, unknown> | null;
    if (evidence?.doh_bypass) {
      const entries = evidence.doh_bypass as DohBypassEntry[];
      if (entries.some((e) => e.can_bypass)) {
        dohBypassResults.push({ hostname: item.hostname, entries });
      }
    }
  }

  // Filter items
  const filteredItems = items.filter((i) => {
    if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
    switch (filter) {
      case 'failures':
        // For threat categories: show items that SHOULD have been blocked but weren't
        // For clean category: show items that were incorrectly blocked (false positives)
        if (i.category === 'clean') return i.verdict?.startsWith('BLOCKED');
        return i.verdict === 'ALLOWED';
      case 'blocked': return i.verdict?.startsWith('BLOCKED');
      case 'allowed': return i.verdict === 'ALLOWED';
      default: return true;
    }
  });

  const grade = score?.overallScore !== null && score?.overallScore !== undefined ? getLetterGrade(score.overallScore) : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1">Benchmark Report</h2>
        <p className="text-gray-400 text-sm">
          {run.routerName || 'Unknown router'} &middot; {run.resolverMode || 'Default DNS'} &middot; {run.completedAt ? new Date(run.completedAt).toLocaleString('en-GB') : 'In progress'}
        </p>
      </div>

      {/* Overall Score Card */}
      {score && grade && (
        <div className={`rounded-lg border p-6 mb-6 ${getGradeBg(grade)}`}>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className={`text-6xl font-bold ${getGradeColour(grade)}`}>{Math.round(score.overallScore!)}</p>
              <p className={`text-3xl font-bold ${getGradeColour(grade)}`}>{grade}</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-medium text-gray-200 mb-1">
                {grade === 'A' && 'Excellent — your network has strong filtering.'}
                {grade === 'B' && 'Good — most threats are blocked, with room to improve.'}
                {grade === 'C' && 'Fair — some filtering is active but gaps remain.'}
                {grade === 'D' && 'Poor — significant threats are getting through.'}
                {grade === 'F' && 'Failing — minimal or no DNS filtering detected.'}
              </p>
              <p className="text-sm text-gray-400">
                Tested {items.length} domains across {Object.keys(categoryCounts).length} categories.
                {blockedCount > 0 ? ` ${blockedCount} threats were blocked.` : ' No threats were blocked.'}
                {allowedCount > 0 && ` ${allowedCount} domains were allowed through.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500 text-center">
          <p className="text-3xl font-bold text-gray-100">{items.length}</p>
          <p className="text-xs text-gray-400 mt-1">Domains Tested</p>
        </div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500 text-center">
          <p className="text-3xl font-bold text-accent-green">{blockedCount}</p>
          <p className="text-xs text-gray-400 mt-1">Threats Blocked</p>
        </div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500 text-center">
          <p className="text-3xl font-bold text-accent-red">{allowedCount}</p>
          <p className="text-xs text-gray-400 mt-1">Allowed Through</p>
        </div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500 text-center">
          <p className="text-3xl font-bold text-accent-yellow">{errorCount}</p>
          <p className="text-xs text-gray-400 mt-1">Errors / Timeouts</p>
        </div>
      </div>

      {/* Category Breakdown */}
      {score && (
        <div className="bg-surface-800 rounded-lg border border-surface-500 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Protection by Category</h3>
          {rateBar('Malware Protection', score.malwareBlockRate, 'Known malware distribution sites')}
          {rateBar('Phishing Protection', score.phishingBlockRate, 'Fake login and credential theft pages')}
          {rateBar('Adult Content Filtering', score.adultFilterRate, 'Pornography and explicit content')}
          {rateBar('Ads & Tracker Blocking', score.adsTrackerBlockRate, 'Advertising networks and tracking scripts')}
          {rateBar('Clean Site Access', score.cleanAllowRate, 'Legitimate sites should not be blocked', true)}
        </div>
      )}

      {/* DoH Bypass Warning */}
      {dohBypassResults.length > 0 && (
        <div className="bg-accent-orange/10 border border-accent-orange/30 rounded-lg p-5 mb-6">
          <h3 className="text-sm font-medium text-accent-orange mb-2">DNS-over-HTTPS Bypass Detected</h3>
          <p className="text-sm text-gray-300 mb-3">
            {dohBypassResults.length} blocked domain{dohBypassResults.length > 1 ? 's' : ''} can be resolved via DNS-over-HTTPS,
            bypassing your network's DNS filtering. Users with browsers like Firefox (which enables DoH by default) may not be protected.
          </p>
          <div className="space-y-2">
            {dohBypassResults.map((r) => (
              <div key={r.hostname} className="bg-surface-800 rounded p-3 text-xs">
                <span className="font-mono text-gray-100">{r.hostname}</span>
                <span className="text-gray-500 ml-2">bypassed via</span>
                <span className="text-accent-orange ml-1">{r.entries.filter((e) => e.can_bypass).map((e) => e.provider).join(', ')}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Recommendation: Block outbound DNS-over-HTTPS traffic (port 443 to known DoH providers) or use a firewall that intercepts DoH.
          </p>
        </div>
      )}

      {/* Verdict Chart + Category Summary side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-800 rounded-lg border border-surface-500 p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">How Domains Were Handled</h3>
          <VerdictChart data={verdictCounts} />
          <div className="mt-3 space-y-1">
            {Object.entries(verdictCounts).sort((a, b) => b[1] - a[1]).map(([v, count]) => (
              <div key={v} className="flex justify-between text-xs">
                <span className="text-gray-300">{verdictLabel(v)}</span>
                <span className="text-gray-400">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface-800 rounded-lg border border-surface-500 p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Results by Category</h3>
          <div className="space-y-3">
            {Object.entries(categoryCounts).map(([cat, counts]) => (
              <div key={cat} className="p-3 bg-surface-700 rounded">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-200">{categoryLabel(cat)}</span>
                  <span className="text-xs text-gray-400">{counts.total} tested</span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-accent-green">{counts.blocked} blocked</span>
                  <span className="text-accent-red">{counts.allowed} allowed</span>
                  {counts.errors > 0 && <span className="text-accent-yellow">{counts.errors} errors</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export */}
      <div className="flex gap-2 mb-4">
        <a href={`/shieldtest/api/reports/${id}.csv`} className="px-3 py-1.5 bg-surface-700 text-gray-300 rounded text-sm hover:bg-surface-600">Export CSV</a>
        <a href={`/shieldtest/api/reports/${id}.json`} className="px-3 py-1.5 bg-surface-700 text-gray-300 rounded text-sm hover:bg-surface-600">Export JSON</a>
        <button onClick={runAgain} disabled={rerunning || !run.probeId} className="px-3 py-1.5 bg-accent-blue text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 ml-auto">
          {rerunning ? 'Starting...' : 'Run Again'}
        </button>
      </div>

      {/* Filtered Results Table */}
      <div className="bg-surface-800 rounded-lg border border-surface-500 overflow-hidden">
        <div className="p-3 border-b border-surface-500 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400 mr-2">Show:</span>
          {([['failures', 'Protection Failures'], ['blocked', 'Blocked'], ['allowed', 'Allowed'], ['all', 'All']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded text-xs ${filter === key ? 'bg-accent-blue text-white' : 'bg-surface-600 text-gray-300 hover:bg-surface-500'}`}>
              {label}
              {key === 'failures' && <span className="ml-1 opacity-70">({items.filter((i) => i.category === 'clean' ? i.verdict?.startsWith('BLOCKED') : i.verdict === 'ALLOWED').length})</span>}
            </button>
          ))}
          <span className="text-xs text-gray-400 ml-4 mr-2">Category:</span>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2 py-1 bg-surface-600 text-gray-300 rounded text-xs border-none">
            <option value="all">All</option>
            {Object.keys(categoryCounts).map((cat) => <option key={cat} value={cat}>{categoryLabel(cat)}</option>)}
          </select>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-surface-500 text-gray-400">
            <th className="text-left p-3">Domain</th>
            <th className="text-left p-3">Category</th>
            <th className="text-left p-3">Result</th>
            <th className="text-left p-3">What This Means</th>
            <th className="text-left p-3">Latency</th>
          </tr></thead>
          <tbody>
            {filteredItems.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-500">
                {filter === 'failures' ? 'No protection failures found — great result!' : 'No matching results.'}
              </td></tr>
            )}
            {filteredItems.map((i, idx) => (
            <tr key={idx} className="border-b border-surface-600 hover:bg-surface-700">
              <td className="p-3 text-gray-100 font-mono text-xs">{i.hostname}</td>
              <td className="p-3"><span className="text-gray-300 text-xs">{categoryLabel(i.category)}</span></td>
              <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${verdictStyle(i.verdict)}`}>{i.verdict ? verdictLabel(i.verdict) : 'Pending'}</span></td>
              <td className="p-3 text-xs text-gray-400">
                {i.category === 'clean' && i.verdict?.startsWith('BLOCKED') && 'False positive — safe site was incorrectly blocked'}
                {i.category === 'clean' && i.verdict === 'ALLOWED' && 'Correct — safe site was allowed'}
                {i.category !== 'clean' && i.verdict === 'ALLOWED' && 'Threat not blocked — your filter missed this'}
                {i.category !== 'clean' && i.verdict?.startsWith('BLOCKED') && 'Correctly blocked — your filter caught this threat'}
                {i.verdict === 'TIMEOUT' && 'DNS lookup timed out'}
                {i.verdict === 'DNS_ERROR' && 'DNS resolution error'}
              </td>
              <td className="p-3 text-gray-400 text-xs">{i.latencyMs ? i.latencyMs + 'ms' : '--'}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="p-3 border-t border-surface-500 text-xs text-gray-500">
          Showing {filteredItems.length} of {items.length} results
        </div>
      </div>
    </div>
  );
}
