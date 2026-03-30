import type { SourceConnector, ConnectorResult, FeedRecord } from './connector.js';
import unzipper from 'unzipper';
import { Readable } from 'node:stream';

export function createTrancoConnector(feedUrl: string, maxRank: number = 10000): SourceConnector {
  return {
    name: 'tranco',
    async fetch(): Promise<ConnectorResult> {
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Tranco fetch failed: ${response.status} ${response.statusText}`);

      const contentType = response.headers.get('content-type') || '';
      let csvText: string;

      if (contentType.includes('zip') || feedUrl.endsWith('.zip')) {
        // Handle ZIP response
        const buffer = Buffer.from(await response.arrayBuffer());
        const directory = await unzipper.Open.buffer(buffer);
        const csvFile = directory.files.find(f => f.path.endsWith('.csv')) || directory.files[0];
        if (!csvFile) throw new Error('No CSV file found in Tranco ZIP');
        const csvBuffer = await csvFile.buffer();
        csvText = csvBuffer.toString('utf-8');
      } else {
        // Handle plain CSV response
        csvText = await response.text();
      }

      const lines = csvText.split('\n');
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
