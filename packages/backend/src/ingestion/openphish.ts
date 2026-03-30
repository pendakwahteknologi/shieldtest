import type { SourceConnector, ConnectorResult, FeedRecord } from './connector.js';
import { extractHostnameFromUrl } from './normalise.js';

export function createOpenPhishConnector(feedUrl: string): SourceConnector {
  return {
    name: 'openphish',
    async fetch(): Promise<ConnectorResult> {
      const response = await fetch(feedUrl, {
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`OpenPhish fetch failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const lines = text.split('\n');

      const records: FeedRecord[] = [];
      const errors: ConnectorResult['errors'] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const hostname = extractHostnameFromUrl(line);
        if (!hostname || !hostname.includes('.')) {
          errors.push({ line: i + 1, raw: line.slice(0, 200), reason: 'Could not extract hostname' });
          continue;
        }

        records.push({
          rawUrl: line,
          rawHostname: hostname,
          category: 'phishing',
          confidence: 75,
        });
      }

      return { records, errors };
    },
  };
}
