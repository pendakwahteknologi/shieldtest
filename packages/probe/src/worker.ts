import { config } from './config.js';
import { checkDns, checkDohBypass } from './dns.js';
import { checkHttp } from './http.js';

interface JobItem { itemId: string; hostname: string; category: string; }
interface Job { jobId: string; runId: string; items: JobItem[]; config: { timeoutMs: number; doHttpCheck: boolean }; }
interface ProbeResult {
  itemId: string;
  verdict: string;
  latencyMs: number;
  evidence: {
    dns: { addresses: string[]; rcode: string; duration_ms: number };
    http?: { status_code: number; headers: Record<string, string>; duration_ms: number };
    error?: string;
  };
}

async function apiCall<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const url = `${config.serverUrl}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${config.probeToken}` };
  if (options.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  return response.json();
}

async function checkItem(item: JobItem, timeoutMs: number): Promise<ProbeResult> {
  const dnsResult = await checkDns(item.hostname, timeoutMs);

  let verdict: string;
  if (dnsResult.rcode === 'TIMEOUT') verdict = 'TIMEOUT';
  else if (dnsResult.rcode === 'NXDOMAIN') verdict = 'BLOCKED_NXDOMAIN';
  else if (dnsResult.rcode !== 'NOERROR') verdict = 'DNS_ERROR';
  else if (dnsResult.isSinkholed) verdict = 'BLOCKED_SINKHOLE';
  else {
    const resolvedToBlockPage = dnsResult.addresses.some((ip) => config.blockPageIps.includes(ip));
    verdict = resolvedToBlockPage ? 'BLOCKED_BLOCKPAGE' : 'ALLOWED';
  }

  let httpEvidence: ProbeResult['evidence']['http'] | undefined;
  if (verdict === 'ALLOWED' && !config.dnsOnly) {
    const httpResult = await checkHttp(item.hostname, timeoutMs);
    if (httpResult) {
      httpEvidence = { status_code: httpResult.statusCode, headers: httpResult.headers, duration_ms: httpResult.durationMs };
      if (httpResult.isBlockPage) verdict = 'BLOCKED_BLOCKPAGE';
    }
  }

  return {
    itemId: item.itemId,
    verdict,
    latencyMs: dnsResult.durationMs,
    evidence: { dns: { addresses: dnsResult.addresses, rcode: dnsResult.rcode, duration_ms: dnsResult.durationMs }, http: httpEvidence },
  };
}

export async function pollAndExecute(): Promise<{ hadWork: boolean; itemCount: number }> {
  try {
    const job = await apiCall<Job>(`/probes/${config.probeId}/jobs`);
    if (!job.items || job.items.length === 0) return { hadWork: false, itemCount: 0 };

    console.log(`  Testing ${job.items.length} domains...`);

    const results: ProbeResult[] = [];
    const concurrency = 5;
    for (let i = 0; i < job.items.length; i += concurrency) {
      const batch = job.items.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map((item) => checkItem(item, job.config.timeoutMs)));
      results.push(...batchResults);
    }

    const blocked = results.filter((r) => r.verdict.startsWith('BLOCKED')).length;
    const allowed = results.filter((r) => r.verdict === 'ALLOWED').length;

    // DoH bypass check: test a sample of blocked domains via DoH
    // If DoH resolves them, the firewall can be bypassed
    const blockedItems = results.filter((r) => r.verdict.startsWith('BLOCKED'));
    if (blockedItems.length > 0) {
      const sample = blockedItems.slice(0, 3); // test up to 3
      console.log(`  Checking DoH bypass on ${sample.length} blocked domains...`);
      for (const item of sample) {
        const hostname = job.items.find((i) => i.itemId === item.itemId)?.hostname;
        if (!hostname) continue;
        const dohResults = await checkDohBypass(hostname, 5000);
        const bypassed = dohResults.filter((r) => r.canBypass);
        if (bypassed.length > 0) {
          console.log(`  ⚠ DoH bypass possible for ${hostname} via ${bypassed.map((b) => b.provider).join(', ')}`);
        }
        // Store DoH results in evidence
        const resultItem = results.find((r) => r.itemId === item.itemId);
        if (resultItem) {
          (resultItem.evidence as Record<string, unknown>).doh_bypass = dohResults.map((r) => ({
            provider: r.provider,
            can_bypass: r.canBypass,
            addresses: r.resolvedAddresses,
            duration_ms: r.durationMs,
          }));
        }
      }
    }

    await apiCall(`/probes/${config.probeId}/results`, { method: 'POST', body: { jobId: job.jobId, results } });
    console.log(`  ✓ ${results.length} done — ${blocked} blocked, ${allowed} allowed`);
    return { hadWork: true, itemCount: results.length };
  } catch (err) {
    console.error('  Poll error:', err);
    return { hadWork: false, itemCount: 0 };
  }
}

export async function sendHeartbeat(): Promise<void> {
  try { await apiCall(`/probes/${config.probeId}/heartbeat`, { method: 'POST' }); }
  catch (err) { console.error('Heartbeat error:', err); }
}
