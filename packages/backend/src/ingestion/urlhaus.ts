import type { SourceConnector, ConnectorResult, FeedRecord } from './connector.js';
import { extractHostnameFromUrl } from './normalise.js';

export function createUrlhausConnector(feedUrl: string): SourceConnector {
  return {
    name: 'urlhaus',
    async fetch(): Promise<ConnectorResult> {
      const response = await fetch(feedUrl, {
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`URLhaus fetch failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const lines = text.split('\n');

      const records: FeedRecord[] = [];
      const errors: ConnectorResult['errors'] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        // CSV: "id","dateadded","url","url_status","last_online","threat","tags","urlhaus_link","reporter"
        const fields = line.match(/"([^"]*)"/g);
        if (!fields || fields.length < 3) {
          errors.push({ line: i + 1, raw: line.slice(0, 200), reason: 'Could not parse CSV line' });
          continue;
        }

        const url = fields[2].replace(/^"|"$/g, '');
        const hostname = extractHostnameFromUrl(url);

        if (!hostname || !hostname.includes('.')) {
          errors.push({ line: i + 1, raw: url.slice(0, 200), reason: 'Could not extract hostname' });
          continue;
        }

        records.push({
          rawUrl: url,
          rawHostname: hostname,
          category: 'malware',
          confidence: 85,
        });
      }

      return { records, errors };
    },
  };
}
