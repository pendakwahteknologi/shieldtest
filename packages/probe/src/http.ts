import { config } from './config.js';

export interface HttpResult {
  statusCode: number;
  headers: Record<string, string>;
  durationMs: number;
  isBlockPage: boolean;
}

export async function checkHttp(hostname: string, timeoutMs: number = 5000): Promise<HttpResult | null> {
  if (config.dnsOnly) return null;

  const start = Date.now();

  try {
    const response = await fetch(`http://${hostname}/`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - start;
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });

    let isBlockPage = false;

    const contentLength = parseInt(headers['content-length'] || '0', 10);
    const serverHeader = headers['server'] || '';

    if (response.status === 200 && contentLength > 0 && contentLength < 512) {
      const isKnownBlockPageServer = config.blockPageSignatures.some(
        (sig) => serverHeader.toLowerCase().includes(sig.toLowerCase()),
      );
      if (isKnownBlockPageServer) isBlockPage = true;
    }

    const location = headers['location'] || '';
    if (response.status >= 300 && response.status < 400) {
      const blockPaths = ['/blocked', '/filter', '/block', '/access-denied'];
      if (blockPaths.some((p) => location.toLowerCase().includes(p))) isBlockPage = true;
    }

    return { statusCode: response.status, headers, durationMs, isBlockPage };
  } catch {
    return null;
  }
}
