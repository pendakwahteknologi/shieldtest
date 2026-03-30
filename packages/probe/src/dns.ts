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
