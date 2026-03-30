import type { SourceConnector, ConnectorResult, FeedRecord } from './connector.js';

const SKIP_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
  'ip6-localnet',
  'ip6-mcastprefix',
  'ip6-allnodes',
  'ip6-allrouters',
  'ip6-allhosts',
]);

export function createStevenBlackConnector(
  feedUrl: string,
  category: string,
): SourceConnector {
  return {
    name: 'stevenblack',
    async fetch(): Promise<ConnectorResult> {
      const response = await fetch(feedUrl, {
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`StevenBlack fetch failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const lines = text.split('\n');

      const records: FeedRecord[] = [];
      const errors: ConnectorResult['errors'] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 2) continue;

        const ip = parts[0];
        const hostname = parts[1].trim();

        if (ip !== '0.0.0.0' && ip !== '127.0.0.1') continue;
        if (!hostname || SKIP_HOSTNAMES.has(hostname)) continue;

        records.push({
          rawHostname: hostname,
          category,
          confidence: 70,
        });
      }

      return { records, errors };
    },
  };
}
