import type { SourceConnector, ConnectorResult, FeedRecord } from './connector.js';
import { extractHostnameFromUrl } from './normalise.js';

export function createFeodoConnector(feedUrl: string): SourceConnector {
  return {
    name: 'feodo',
    async fetch(): Promise<ConnectorResult> {
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Feodo fetch failed: ${response.status} ${response.statusText}`);

      const text = await response.text();
      const lines = text.split('\n');
      const records: FeedRecord[] = [];
      const errors: ConnectorResult['errors'] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        // This feed is plain IPs, one per line
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(line)) {
          records.push({
            rawHostname: line,
            category: 'c2',
            confidence: 90,
          });
          continue;
        }

        // Also handle CSV format: first_seen_utc,dst_ip,dst_port,...
        const parts = line.split(',');
        if (parts.length >= 2) {
          const ip = parts[1]?.trim();
          if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
            records.push({ rawHostname: ip, category: 'c2', confidence: 90 });
          }
        }
      }

      return { records, errors };
    },
  };
}
