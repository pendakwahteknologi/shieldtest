import type { SourceConnector, ConnectorResult, FeedRecord } from './connector.js';
import { extractHostnameFromUrl } from './normalise.js';

interface PhishTankEntry {
  phish_id: string;
  url: string;
  verified: string;
  online: string;
}

export function createPhishTankConnector(feedUrl: string): SourceConnector {
  return {
    name: 'phishtank',
    async fetch(): Promise<ConnectorResult> {
      const response = await fetch(feedUrl, {
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`PhishTank fetch failed: ${response.status} ${response.statusText}`);
      }

      const entries: PhishTankEntry[] = await response.json();

      const records: FeedRecord[] = [];
      const errors: ConnectorResult['errors'] = [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        if (entry.verified !== 'yes') continue;

        const hostname = extractHostnameFromUrl(entry.url);
        if (!hostname) {
          errors.push({ line: i + 1, raw: entry.url?.slice(0, 200) ?? '', reason: 'Could not extract hostname' });
          continue;
        }

        records.push({
          rawUrl: entry.url,
          rawHostname: hostname,
          category: 'phishing',
          confidence: 80,
        });
      }

      return { records, errors };
    },
  };
}
