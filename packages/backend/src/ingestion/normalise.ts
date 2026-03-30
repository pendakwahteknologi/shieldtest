import { parse } from 'tldts';

export interface NormalisedHost {
  hostname: string;
  registrableDomain: string | null;
}

export function normaliseHostname(raw: string): NormalisedHost | null {
  if (!raw || raw.trim().length === 0) return null;

  let hostname = raw.trim().toLowerCase();

  // Strip www. prefix
  if (hostname.startsWith('www.')) {
    hostname = hostname.slice(4);
  }

  // Remove trailing dot
  if (hostname.endsWith('.')) {
    hostname = hostname.slice(0, -1);
  }

  if (hostname.length === 0 || hostname === '.' || hostname === '..') return null;

  // Check if it's an IP address
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
    return { hostname, registrableDomain: null };
  }

  const parsed = parse(hostname);
  if (!parsed.hostname) return null;

  return {
    hostname: parsed.hostname,
    registrableDomain: parsed.domain || null,
  };
}

export function extractHostnameFromUrl(url: string): string | null {
  if (!url || url.trim().length === 0) return null;

  try {
    const withProtocol = url.includes('://') ? url : `https://${url}`;
    const parsed = new URL(withProtocol);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}
