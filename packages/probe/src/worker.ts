import { config } from './config.js';
import { checkDns } from './dns.js';
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

export async function pollAndExecute(): Promise<boolean> {
  try {
    const job = await apiCall<Job>(`/probes/${config.probeId}/jobs`);
    if (!job.items || job.items.length === 0) return false;

    console.log(`Received job ${job.jobId} with ${job.items.length} items`);

    const results: ProbeResult[] = [];
    const concurrency = 5;
    for (let i = 0; i < job.items.length; i += concurrency) {
      const batch = job.items.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map((item) => checkItem(item, job.config.timeoutMs)));
      results.push(...batchResults);
    }

    await apiCall(`/probes/${config.probeId}/results`, { method: 'POST', body: { jobId: job.jobId, results } });
    console.log(`Submitted ${results.length} results for job ${job.jobId}`);
    return true;
  } catch (err) {
    console.error('Poll error:', err);
    return false;
  }
}

export async function sendHeartbeat(): Promise<void> {
  try { await apiCall(`/probes/${config.probeId}/heartbeat`, { method: 'POST' }); }
  catch (err) { console.error('Heartbeat error:', err); }
}
