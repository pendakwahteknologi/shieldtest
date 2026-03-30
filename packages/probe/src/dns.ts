import dns from 'node:dns';
import { promisify } from 'node:util';
import { isSinkhole } from './sinkhole.js';

const resolve4 = promisify(dns.resolve4);

export interface DnsResult {
  addresses: string[];
  rcode: string;
  durationMs: number;
  isSinkholed: boolean;
}

export async function checkDns(hostname: string, timeoutMs: number = 5000): Promise<DnsResult> {
  const start = Date.now();

  try {
    const addresses = await Promise.race([
      resolve4(hostname),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DNS_TIMEOUT')), timeoutMs),
      ),
    ]);

    const durationMs = Date.now() - start;
    const sinkholed = addresses.some(isSinkhole);

    return { addresses, rcode: 'NOERROR', durationMs, isSinkholed: sinkholed };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const error = err as { code?: string; message?: string };

    if (error.message === 'DNS_TIMEOUT') {
      return { addresses: [], rcode: 'TIMEOUT', durationMs, isSinkholed: false };
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return { addresses: [], rcode: 'NXDOMAIN', durationMs, isSinkholed: false };
    }
    return { addresses: [], rcode: error.code || 'SERVFAIL', durationMs, isSinkholed: false };
  }
}

// DNS-over-HTTPS bypass test
// Tests if the network allows DoH connections to popular providers
// If it resolves via DoH, the firewall's DNS filtering can be bypassed

const DOH_PROVIDERS = [
  { name: 'Cloudflare', url: 'https://1.1.1.1/dns-query' },
  { name: 'Google', url: 'https://dns.google/resolve' },
  { name: 'Quad9', url: 'https://dns.quad9.net:5053/dns-query' },
];

export interface DohBypassResult {
  provider: string;
  canBypass: boolean;
  resolvedAddresses: string[];
  durationMs: number;
  error?: string;
}

export async function checkDohBypass(hostname: string, timeoutMs: number = 5000): Promise<DohBypassResult[]> {
  const results: DohBypassResult[] = [];

  for (const provider of DOH_PROVIDERS) {
    const start = Date.now();
    try {
      const dohUrl = provider.url.includes('dns.google')
        ? `${provider.url}?name=${hostname}&type=A`
        : `${provider.url}?name=${hostname}&type=A`;

      const response = await fetch(dohUrl, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const durationMs = Date.now() - start;

      if (!response.ok) {
        results.push({ provider: provider.name, canBypass: false, resolvedAddresses: [], durationMs, error: `HTTP ${response.status}` });
        continue;
      }

      const data = await response.json() as { Answer?: Array<{ type: number; data: string }> };
      const addresses = (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);

      results.push({
        provider: provider.name,
        canBypass: addresses.length > 0,
        resolvedAddresses: addresses,
        durationMs,
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      results.push({
        provider: provider.name,
        canBypass: false,
        resolvedAddresses: [],
        durationMs,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return results;
}
