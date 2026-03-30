import type { SourceConnector, ConnectorResult, FeedRecord } from './connector.js';

export function createCoinBlockerConnector(feedUrl: string): SourceConnector {
  return {
    name: 'coinblocker',
    async fetch(): Promise<ConnectorResult> {
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`CoinBlocker fetch failed: ${response.status} ${response.statusText}`);

      const text = await response.text();
      const lines = text.split('\n');
      const records: FeedRecord[] = [];
      const errors: ConnectorResult['errors'] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        // Plain hostname list, one per line
        if (!line.includes('.')) continue;

        records.push({
          rawHostname: line,
          category: 'cryptomining',
          confidence: 75,
        });
      }

      return { records, errors };
    },
  };
}
