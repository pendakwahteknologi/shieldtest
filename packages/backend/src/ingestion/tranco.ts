import type { SourceConnector, ConnectorResult, FeedRecord } from './connector.js';

export function createTrancoConnector(feedUrl: string, maxRank: number = 10000): SourceConnector {
  return {
    name: 'tranco',
    async fetch(): Promise<ConnectorResult> {
      const response = await fetch(feedUrl, {
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`Tranco fetch failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const lines = text.split('\n');

      const records: FeedRecord[] = [];
      const errors: ConnectorResult['errors'] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',');
        if (parts.length < 2) {
          errors.push({ line: i + 1, raw: line.slice(0, 200), reason: 'Invalid CSV format' });
          continue;
        }

        const rank = parseInt(parts[0], 10);
        const domain = parts[1].trim();

        if (isNaN(rank) || rank > maxRank) continue;
        if (!domain) continue;

        const confidence = rank <= 1000 ? 95 : 85;

        records.push({
          rawHostname: domain,
          category: 'clean',
          confidence,
        });
      }

      return { records, errors };
    },
  };
}
