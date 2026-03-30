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

        // CSV format: first_seen_utc,dst_ip,dst_port,c2_status,last_online,malware
        const parts = line.split(',');
        if (parts.length < 6) continue;

        const ip = parts[1]?.trim();
        if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;

        // We'll store IP as hostname for DNS/reachability testing
        records.push({
          rawHostname: ip,
          category: 'c2',
          confidence: 90,
        });
      }

      return { records, errors };
    },
  };
}
