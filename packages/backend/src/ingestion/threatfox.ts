import type { SourceConnector, ConnectorResult, FeedRecord } from './connector.js';
import { extractHostnameFromUrl } from './normalise.js';

interface ThreatFoxEntry {
  ioc: string;
  ioc_type: string;
  threat_type: string;
  malware: string;
  confidence_level: number;
}

export function createThreatFoxConnector(feedUrl: string): SourceConnector {
  return {
    name: 'threatfox',
    async fetch(): Promise<ConnectorResult> {
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`ThreatFox fetch failed: ${response.status} ${response.statusText}`);

      const text = await response.text();
      const lines = text.split('\n');
      const records: FeedRecord[] = [];
      const errors: ConnectorResult['errors'] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        // CSV: "first_seen_utc", "ioc_id", "ioc_value", "ioc_type", "threat_type", ...
        // Note: fields may have spaces after commas
        const fields = line.match(/"([^"]*)"/g);
        if (!fields || fields.length < 5) continue;

        const clean = (s: string) => s.replace(/^"|"$/g, '').trim();
        const iocValue = clean(fields[2]);
        const iocType = clean(fields[3]);

        // Only use domain and URL type IOCs
        if (iocType === 'domain') {
          records.push({ rawHostname: iocValue, category: 'c2', confidence: 85 });
        } else if (iocType === 'url') {
          const hostname = extractHostnameFromUrl(iocValue);
          if (hostname && hostname.includes('.')) {
            records.push({ rawUrl: iocValue, rawHostname: hostname, category: 'c2', confidence: 85 });
          }
        }
      }

      return { records, errors };
    },
  };
}
