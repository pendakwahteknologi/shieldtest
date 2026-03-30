# Dataset Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ingestion pipeline that fetches threat intelligence feeds, normalises hostnames, deduplicates indicators, and stores them in the database with scheduled refresh via BullMQ.

**Architecture:** Each source gets a connector module that implements a common interface (fetch → parse → normalise → upsert). A BullMQ queue manages scheduled and manual sync jobs. A shared hostname normalisation utility handles lowercase, www-stripping, and registrable domain extraction via `tldts`. Source API routes allow listing sources, triggering syncs, and viewing sync history.

**Tech Stack:** BullMQ, ioredis, tldts (domain parsing), node:fetch (HTTP), Drizzle ORM, Fastify

**Spec:** `docs/superpowers/specs/2026-03-30-shieldtest-design.md`

**Depends on:** Foundation plan (complete)

---

## File Structure

```
packages/backend/src/
├── ingestion/
│   ├── connector.ts          # Common connector interface and base helpers
│   ├── normalise.ts          # Hostname normalisation (tldts, lowercase, strip www)
│   ├── urlhaus.ts            # URLhaus connector
│   ├── openphish.ts          # OpenPhish connector
│   ├── phishtank.ts          # PhishTank connector
│   ├── tranco.ts             # Tranco connector
│   ├── stevenblack.ts        # StevenBlack hosts connector
│   └── __tests__/
│       ├── normalise.test.ts # Unit tests for hostname normalisation
│       └── connectors.test.ts# Unit tests for parse logic (mocked fetch)
├── queue/
│   ├── connection.ts         # Shared ioredis connection for BullMQ
│   ├── sync-worker.ts        # BullMQ worker that dispatches to connectors
│   └── sync-scheduler.ts     # Registers repeatable jobs per source
├── routes/
│   └── sources.ts            # Source CRUD + sync trigger + sync history API
├── services/
│   └── sources.ts            # Source business logic (list, sync, history)
└── server.ts                 # Modified: register source routes + start worker
```

New dependency to install: `tldts` (for registrable domain extraction)

---

### Task 1: Install tldts + Hostname Normalisation

**Files:**
- Create: `packages/backend/src/ingestion/normalise.ts`
- Create: `packages/backend/src/ingestion/__tests__/normalise.test.ts`

- [ ] **Step 1: Install tldts**

Run: `cd /home/adilhidayat/shieldtest && npm install tldts -w packages/backend`

- [ ] **Step 2: Write failing test**

Create `packages/backend/src/ingestion/__tests__/normalise.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normaliseHostname, extractHostnameFromUrl } from '../normalise.js';

describe('normaliseHostname', () => {
  it('should lowercase hostnames', () => {
    expect(normaliseHostname('Example.COM')).toEqual({
      hostname: 'example.com',
      registrableDomain: 'example.com',
    });
  });

  it('should strip www prefix', () => {
    expect(normaliseHostname('www.example.com')).toEqual({
      hostname: 'example.com',
      registrableDomain: 'example.com',
    });
  });

  it('should handle subdomains', () => {
    const result = normaliseHostname('malware.evil.co.uk');
    expect(result.hostname).toBe('malware.evil.co.uk');
    expect(result.registrableDomain).toBe('evil.co.uk');
  });

  it('should return null for invalid hostnames', () => {
    expect(normaliseHostname('')).toBeNull();
    expect(normaliseHostname('...')).toBeNull();
  });

  it('should handle IP addresses', () => {
    const result = normaliseHostname('192.168.1.1');
    expect(result?.hostname).toBe('192.168.1.1');
  });
});

describe('extractHostnameFromUrl', () => {
  it('should extract hostname from full URL', () => {
    expect(extractHostnameFromUrl('https://evil.example.com/malware.exe'))
      .toBe('evil.example.com');
  });

  it('should handle URLs without protocol', () => {
    expect(extractHostnameFromUrl('evil.example.com/path'))
      .toBe('evil.example.com');
  });

  it('should return null for empty input', () => {
    expect(extractHostnameFromUrl('')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/ingestion/__tests__/normalise.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement normalise.ts**

```typescript
import { parse } from 'tldts';

export interface NormalisedHost {
  hostname: string;
  registrableDomain: string | null;
}

export function normaliseHostname(raw: string): NormalisedHost | null {
  if (!raw || raw.trim().length === 0) return null;

  let hostname = raw.trim().toLowerCase();

  // Strip www. prefix
  if (hostname.startsWith('www.')) {
    hostname = hostname.slice(4);
  }

  // Remove trailing dot
  if (hostname.endsWith('.')) {
    hostname = hostname.slice(0, -1);
  }

  if (hostname.length === 0 || hostname === '.' || hostname === '..') return null;

  // Check if it's an IP address
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
    return { hostname, registrableDomain: null };
  }

  const parsed = parse(hostname);
  if (!parsed.hostname) return null;

  return {
    hostname: parsed.hostname,
    registrableDomain: parsed.domain || null,
  };
}

export function extractHostnameFromUrl(url: string): string | null {
  if (!url || url.trim().length === 0) return null;

  try {
    // Add protocol if missing for URL parsing
    const withProtocol = url.includes('://') ? url : `https://${url}`;
    const parsed = new URL(withProtocol);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/ingestion/__tests__/normalise.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/ingestion/ package-lock.json packages/backend/package.json
git commit -m "feat: add hostname normalisation with tldts"
```

---

### Task 2: Connector Interface + Upsert Logic

**Files:**
- Create: `packages/backend/src/ingestion/connector.ts`

- [ ] **Step 1: Create connector.ts**

```typescript
import { eq, and, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { normaliseHostname, extractHostnameFromUrl } from './normalise.js';
import type { NormalisedHost } from './normalise.js';

export interface FeedRecord {
  rawUrl?: string;
  rawHostname?: string;
  category: string;
  confidence: number;
}

export interface ConnectorResult {
  records: FeedRecord[];
  errors: Array<{ line: number; raw: string; reason: string }>;
}

export interface SourceConnector {
  name: string;
  fetch(): Promise<ConnectorResult>;
}

export interface SyncStats {
  recordsFetched: number;
  recordsAdded: number;
  recordsSkipped: number;
  errors: Array<{ line: number; raw: string; reason: string }>;
}

export async function upsertIndicators(
  sourceId: string,
  records: FeedRecord[],
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;

  // Process in batches of 100
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);

    for (const record of batch) {
      // Extract and normalise hostname
      let hostname: string | null = null;
      let normResult: NormalisedHost | null = null;

      if (record.rawHostname) {
        normResult = normaliseHostname(record.rawHostname);
        hostname = normResult?.hostname ?? null;
      } else if (record.rawUrl) {
        const extracted = extractHostnameFromUrl(record.rawUrl);
        if (extracted) {
          normResult = normaliseHostname(extracted);
          hostname = normResult?.hostname ?? null;
        }
      }

      if (!hostname) {
        skipped++;
        continue;
      }

      // Upsert: insert or update last_seen_at
      const existing = await db
        .select({ id: schema.indicators.id })
        .from(schema.indicators)
        .where(
          and(
            eq(schema.indicators.hostname, hostname),
            eq(schema.indicators.sourceId, sourceId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(schema.indicators)
          .set({
            lastSeenAt: new Date(),
            confidence: record.confidence,
            isActive: true,
          })
          .where(eq(schema.indicators.id, existing[0].id));
        skipped++;
      } else {
        await db.insert(schema.indicators).values({
          sourceId,
          hostname,
          registrableDomain: normResult?.registrableDomain ?? null,
          fullUrl: record.rawUrl ?? null,
          category: record.category,
          confidence: record.confidence,
          isActive: true,
        });
        added++;
      }
    }
  }

  return { added, skipped };
}

export async function runSync(
  sourceId: string,
  connector: SourceConnector,
): Promise<SyncStats> {
  // Create sync run record
  const [syncRun] = await db
    .insert(schema.sourceSyncRuns)
    .values({
      sourceId,
      status: 'running',
    })
    .returning({ id: schema.sourceSyncRuns.id });

  try {
    const result = await connector.fetch();
    const { added, skipped } = await upsertIndicators(sourceId, result.records);

    // Update source last_synced_at
    await db
      .update(schema.sources)
      .set({ lastSyncedAt: new Date() })
      .where(eq(schema.sources.id, sourceId));

    // Complete sync run
    await db
      .update(schema.sourceSyncRuns)
      .set({
        status: 'completed',
        recordsFetched: result.records.length,
        recordsAdded: added,
        recordsSkipped: skipped,
        errorsJson: result.errors.length > 0 ? result.errors : null,
        completedAt: new Date(),
      })
      .where(eq(schema.sourceSyncRuns.id, syncRun.id));

    return {
      recordsFetched: result.records.length,
      recordsAdded: added,
      recordsSkipped: skipped,
      errors: result.errors,
    };
  } catch (err) {
    await db
      .update(schema.sourceSyncRuns)
      .set({
        status: 'failed',
        errorsJson: [{ line: 0, raw: '', reason: String(err) }],
        completedAt: new Date(),
      })
      .where(eq(schema.sourceSyncRuns.id, syncRun.id));

    throw err;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/ingestion/connector.ts
git commit -m "feat: add connector interface with upsert and sync run logic"
```

---

### Task 3: URLhaus Connector

**Files:**
- Create: `packages/backend/src/ingestion/urlhaus.ts`
- Create: `packages/backend/src/ingestion/__tests__/connectors.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/backend/src/ingestion/__tests__/connectors.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createUrlhausConnector } from '../urlhaus.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('URLhaus connector', () => {
  it('should parse CSV and extract hostnames', async () => {
    const csvData = `# URLhaus CSV header line
# another comment
"2024-01-01","https://evil.example.com/malware.exe","online","malware_download"
"2024-01-02","https://bad.example.org/payload.bin","online","malware_download"
"2024-01-03","not-a-valid-url","online","malware_download"`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(csvData),
    });

    const connector = createUrlhausConnector('https://urlhaus.abuse.ch/downloads/csv_recent/');
    const result = await connector.fetch();

    expect(result.records.length).toBe(2);
    expect(result.records[0].rawUrl).toBe('https://evil.example.com/malware.exe');
    expect(result.records[0].category).toBe('malware');
    expect(result.records[0].confidence).toBe(85);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const connector = createUrlhausConnector('https://urlhaus.abuse.ch/downloads/csv_recent/');
    await expect(connector.fetch()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/ingestion/__tests__/connectors.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement urlhaus.ts**

```typescript
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

        // CSV format: "date","url","status","threat"
        const match = line.match(/"([^"]*?)","([^"]*?)","([^"]*?)","([^"]*?)"/);
        if (!match) {
          errors.push({ line: i + 1, raw: line.slice(0, 200), reason: 'Could not parse CSV line' });
          continue;
        }

        const url = match[2];
        const hostname = extractHostnameFromUrl(url);

        if (!hostname) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/ingestion/__tests__/connectors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ingestion/urlhaus.ts packages/backend/src/ingestion/__tests__/connectors.test.ts
git commit -m "feat: add URLhaus connector with CSV parsing"
```

---

### Task 4: OpenPhish + PhishTank Connectors

**Files:**
- Create: `packages/backend/src/ingestion/openphish.ts`
- Create: `packages/backend/src/ingestion/phishtank.ts`
- Modify: `packages/backend/src/ingestion/__tests__/connectors.test.ts`

- [ ] **Step 1: Add tests for OpenPhish and PhishTank**

Append to `packages/backend/src/ingestion/__tests__/connectors.test.ts`:

```typescript
import { createOpenPhishConnector } from '../openphish.js';
import { createPhishTankConnector } from '../phishtank.js';

describe('OpenPhish connector', () => {
  it('should parse plain text URL list', async () => {
    const feedData = `https://phishing.example.com/login
https://fake-bank.example.org/signin
invalid-not-a-url`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(feedData),
    });

    const connector = createOpenPhishConnector('https://openphish.com/feed.txt');
    const result = await connector.fetch();

    expect(result.records.length).toBe(2);
    expect(result.records[0].category).toBe('phishing');
    expect(result.records[0].confidence).toBe(75);
  });
});

describe('PhishTank connector', () => {
  it('should parse JSON feed', async () => {
    const feedData = JSON.stringify([
      { phish_id: '1', url: 'https://phish1.example.com/login', verified: 'yes', online: 'yes' },
      { phish_id: '2', url: 'https://phish2.example.com/bank', verified: 'yes', online: 'yes' },
      { phish_id: '3', url: 'https://phish3.example.com/fake', verified: 'no', online: 'yes' },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(JSON.parse(feedData)),
    });

    const connector = createPhishTankConnector('https://data.phishtank.com/data/online-valid.json');
    const result = await connector.fetch();

    // Only verified entries
    expect(result.records.length).toBe(2);
    expect(result.records[0].category).toBe('phishing');
    expect(result.records[0].confidence).toBe(80);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/ingestion/__tests__/connectors.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement openphish.ts**

```typescript
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
        if (!hostname) {
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
```

- [ ] **Step 4: Implement phishtank.ts**

```typescript
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

        // Only include verified phishing entries
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/ingestion/__tests__/connectors.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/ingestion/openphish.ts packages/backend/src/ingestion/phishtank.ts packages/backend/src/ingestion/__tests__/connectors.test.ts
git commit -m "feat: add OpenPhish and PhishTank connectors"
```

---

### Task 5: Tranco + StevenBlack Connectors

**Files:**
- Create: `packages/backend/src/ingestion/tranco.ts`
- Create: `packages/backend/src/ingestion/stevenblack.ts`
- Modify: `packages/backend/src/ingestion/__tests__/connectors.test.ts`

- [ ] **Step 1: Add tests**

Append to `packages/backend/src/ingestion/__tests__/connectors.test.ts`:

```typescript
import { createTrancoConnector } from '../tranco.js';
import { createStevenBlackConnector } from '../stevenblack.js';

describe('Tranco connector', () => {
  it('should parse CSV ranked domain list', async () => {
    const csvData = `1,google.com
2,youtube.com
3,facebook.com
10001,should-be-excluded.com`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(csvData),
    });

    const connector = createTrancoConnector('https://tranco-list.eu/download/test/1000000', 10000);
    const result = await connector.fetch();

    expect(result.records.length).toBe(3);
    expect(result.records[0].rawHostname).toBe('google.com');
    expect(result.records[0].category).toBe('clean');
    // Top 1K should have higher confidence
    expect(result.records[0].confidence).toBe(95);
  });
});

describe('StevenBlack connector', () => {
  it('should parse hosts file format', async () => {
    const hostsData = `# StevenBlack hosts file
# Comment line
0.0.0.0 ads.example.com
0.0.0.0 tracker.example.org
127.0.0.1 localhost
# end`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(hostsData),
    });

    const connector = createStevenBlackConnector(
      'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
      'ads',
    );
    const result = await connector.fetch();

    expect(result.records.length).toBe(2);
    expect(result.records[0].rawHostname).toBe('ads.example.com');
    expect(result.records[0].category).toBe('ads');
    expect(result.records[0].confidence).toBe(70);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/ingestion/__tests__/connectors.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement tranco.ts**

```typescript
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

        // Top 1K gets higher confidence
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
```

- [ ] **Step 4: Implement stevenblack.ts**

```typescript
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

        // Format: 0.0.0.0 hostname or 127.0.0.1 hostname
        const parts = line.split(/\s+/);
        if (parts.length < 2) continue;

        const ip = parts[0];
        const hostname = parts[1].trim();

        // Only process lines with 0.0.0.0 or 127.0.0.1
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/ingestion/__tests__/connectors.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/ingestion/tranco.ts packages/backend/src/ingestion/stevenblack.ts packages/backend/src/ingestion/__tests__/connectors.test.ts
git commit -m "feat: add Tranco and StevenBlack connectors"
```

---

### Task 6: BullMQ Queue + Sync Worker

**Files:**
- Create: `packages/backend/src/queue/connection.ts`
- Create: `packages/backend/src/queue/sync-worker.ts`
- Create: `packages/backend/src/queue/sync-scheduler.ts`

- [ ] **Step 1: Create Redis connection**

Create `packages/backend/src/queue/connection.ts`:

```typescript
import IORedis from 'ioredis';
import { config } from '../config.js';

export const redisConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});
```

- [ ] **Step 2: Create sync worker**

Create `packages/backend/src/queue/sync-worker.ts`:

```typescript
import { Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { redisConnection } from './connection.js';
import { db, schema } from '../db/index.js';
import { runSync } from '../ingestion/connector.js';
import { createUrlhausConnector } from '../ingestion/urlhaus.js';
import { createOpenPhishConnector } from '../ingestion/openphish.js';
import { createPhishTankConnector } from '../ingestion/phishtank.js';
import { createTrancoConnector } from '../ingestion/tranco.js';
import { createStevenBlackConnector } from '../ingestion/stevenblack.js';
import type { SourceConnector } from '../ingestion/connector.js';

const CONNECTOR_MAP: Record<string, (url: string) => SourceConnector> = {
  urlhaus: (url) => createUrlhausConnector(url),
  openphish: (url) => createOpenPhishConnector(url),
  phishtank: (url) => createPhishTankConnector(url),
  tranco: (url) => createTrancoConnector(url),
  'stevenblack-ads': (url) => createStevenBlackConnector(url, 'ads'),
  'stevenblack-adult': (url) => createStevenBlackConnector(url, 'adult'),
};

export interface SyncJobData {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
}

async function processSyncJob(job: Job<SyncJobData>) {
  const { sourceId, sourceName, sourceUrl } = job.data;

  job.log(`Starting sync for source: ${sourceName}`);

  const createConnector = CONNECTOR_MAP[sourceName];
  if (!createConnector) {
    throw new Error(`No connector found for source: ${sourceName}`);
  }

  const connector = createConnector(sourceUrl);
  const stats = await runSync(sourceId, connector);

  job.log(`Sync complete: ${stats.recordsAdded} added, ${stats.recordsSkipped} skipped, ${stats.errors.length} errors`);

  return stats;
}

export function createSyncWorker() {
  const worker = new Worker<SyncJobData>('source-sync', processSyncJob, {
    connection: redisConnection,
    concurrency: 1,
    limiter: {
      max: 1,
      duration: 5000,
    },
  });

  worker.on('completed', (job) => {
    console.log(`Sync job ${job.id} completed for ${job.data.sourceName}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Sync job ${job?.id} failed for ${job?.data.sourceName}:`, err.message);
  });

  return worker;
}
```

- [ ] **Step 3: Create sync scheduler**

Create `packages/backend/src/queue/sync-scheduler.ts`:

```typescript
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { redisConnection } from './connection.js';
import { db, schema } from '../db/index.js';
import type { SyncJobData } from './sync-worker.js';

export const syncQueue = new Queue<SyncJobData>('source-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

export async function scheduleSyncJobs() {
  // Remove old repeatable jobs
  const existingJobs = await syncQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await syncQueue.removeRepeatableByKey(job.key);
  }

  // Get all enabled sources
  const sources = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.enabled, true));

  for (const source of sources) {
    const intervalMs = source.refreshIntervalMins * 60 * 1000;

    await syncQueue.add(
      `sync-${source.name}`,
      {
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
      },
      {
        repeat: {
          every: intervalMs,
        },
        jobId: `scheduled-${source.name}`,
      },
    );

    console.log(`Scheduled sync for ${source.name} every ${source.refreshIntervalMins} minutes`);
  }
}

export async function triggerManualSync(sourceId: string): Promise<string> {
  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, sourceId))
    .limit(1);

  if (!source) {
    throw new Error('Source not found');
  }

  const job = await syncQueue.add(
    `manual-sync-${source.name}`,
    {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
    },
    {
      jobId: `manual-${source.name}-${Date.now()}`,
    },
  );

  return job.id!;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/queue/
git commit -m "feat: add BullMQ sync queue, worker, and scheduler"
```

---

### Task 7: Source API Routes

**Files:**
- Create: `packages/backend/src/routes/sources.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Create source routes**

Create `packages/backend/src/routes/sources.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { triggerManualSync } from '../queue/sync-scheduler.js';
import { PAGINATION_DEFAULTS } from '@shieldtest/shared';

export async function sourceRoutes(app: FastifyInstance) {
  // All source routes require auth
  app.addHook('preHandler', requireAuth);

  // List all sources with last sync status
  app.get('/sources', async () => {
    const sources = await db
      .select()
      .from(schema.sources)
      .orderBy(schema.sources.name);

    return { data: sources };
  });

  // Update source (enable/disable, refresh interval)
  app.put<{ Params: { id: string } }>('/sources/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as { enabled?: boolean; refreshIntervalMins?: number };

    const updates: Record<string, unknown> = {};
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.refreshIntervalMins !== undefined) updates.refreshIntervalMins = body.refreshIntervalMins;

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' },
      });
    }

    const [updated] = await db
      .update(schema.sources)
      .set(updates)
      .where(eq(schema.sources.id, id))
      .returning();

    if (!updated) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Source not found' },
      });
    }

    return { data: updated };
  });

  // Trigger manual sync
  app.post<{ Params: { id: string } }>('/sources/:id/sync', async (request, reply) => {
    const { id } = request.params;

    try {
      const jobId = await triggerManualSync(id);
      return { ok: true, jobId };
    } catch (err) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: String(err) },
      });
    }
  });

  // List sync runs (paginated)
  app.get('/sources/sync-runs', async (request) => {
    const query = request.query as { page?: string; limit?: string; sourceId?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(
      PAGINATION_DEFAULTS.maxLimit,
      Math.max(1, parseInt(query.limit || String(PAGINATION_DEFAULTS.limit), 10)),
    );
    const offset = (page - 1) * limit;

    let baseQuery = db.select().from(schema.sourceSyncRuns);

    if (query.sourceId) {
      baseQuery = baseQuery.where(eq(schema.sourceSyncRuns.sourceId, query.sourceId)) as typeof baseQuery;
    }

    const runs = await baseQuery
      .orderBy(desc(schema.sourceSyncRuns.startedAt))
      .limit(limit)
      .offset(offset);

    return {
      data: runs,
      pagination: { page, limit },
    };
  });

  // Indicator stats
  app.get('/indicators/stats', async () => {
    const stats = await db
      .select({
        category: schema.indicators.category,
      })
      .from(schema.indicators)
      .where(eq(schema.indicators.isActive, true));

    // Count per category
    const counts: Record<string, number> = {};
    for (const row of stats) {
      counts[row.category] = (counts[row.category] || 0) + 1;
    }

    return { data: counts };
  });
}
```

- [ ] **Step 2: Register source routes in server.ts**

Add to `packages/backend/src/server.ts` after the existing route registrations:

```typescript
import { sourceRoutes } from './routes/sources.js';
import { createSyncWorker } from './queue/sync-worker.js';
import { scheduleSyncJobs } from './queue/sync-scheduler.js';
```

And in the route registration section:
```typescript
await app.register(sourceRoutes, { prefix: config.apiBasePath });
```

And in the start function, after `app.listen`:
```typescript
    // Start BullMQ worker and scheduler
    createSyncWorker();
    await scheduleSyncJobs();
    app.log.info('Sync worker and scheduler started');
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/sources.ts packages/backend/src/server.ts
git commit -m "feat: add source API routes and wire up sync worker/scheduler"
```

---

### Task 8: Seed Sources

**Files:**
- Create: `packages/backend/src/scripts/seed-sources.ts`

- [ ] **Step 1: Create seed script**

```typescript
import 'dotenv/config';
import { db, schema } from '../db/index.js';

const SOURCES = [
  {
    name: 'urlhaus',
    type: 'threat',
    url: 'https://urlhaus.abuse.ch/downloads/csv_recent/',
    refreshIntervalMins: 360,
  },
  {
    name: 'openphish',
    type: 'threat',
    url: 'https://openphish.com/feed.txt',
    refreshIntervalMins: 360,
  },
  {
    name: 'phishtank',
    type: 'threat',
    url: 'https://data.phishtank.com/data/online-valid.json',
    refreshIntervalMins: 720,
  },
  {
    name: 'tranco',
    type: 'clean',
    url: 'https://tranco-list.eu/download/6Q2V4/1000000',
    refreshIntervalMins: 10080, // weekly
  },
  {
    name: 'stevenblack-ads',
    type: 'category',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    refreshIntervalMins: 10080,
  },
  {
    name: 'stevenblack-adult',
    type: 'category',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts',
    refreshIntervalMins: 10080,
  },
];

async function main() {
  console.log('Seeding sources...');

  for (const source of SOURCES) {
    await db
      .insert(schema.sources)
      .values(source)
      .onConflictDoNothing({ target: schema.sources.name });

    console.log(`  Seeded: ${source.name}`);
  }

  console.log('Sources seeded successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to seed sources:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add seed script to package.json**

Add to `packages/backend/package.json` scripts:
```json
"seed-sources": "tsx src/scripts/seed-sources.ts"
```

And to root `package.json`:
```json
"seed-sources": "npm run seed-sources -w packages/backend"
```

- [ ] **Step 3: Run the seed**

Run: `cd /home/adilhidayat/shieldtest && npm run seed-sources`
Expected: "Sources seeded successfully." with 6 sources listed

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/scripts/seed-sources.ts packages/backend/package.json package.json
git commit -m "feat: add source seed script with all 6 feed sources"
```

---

### Task 9: Integration Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run`
Expected: All tests pass (auth + health + normalise + connectors)

- [ ] **Step 2: Start backend and verify sources endpoint**

Run: `cd /home/adilhidayat/shieldtest && npx tsx packages/backend/src/server.ts &`
Then create a test user and login:
```bash
echo -e "testadmin\ntestpassword123" | npx tsx packages/backend/src/scripts/create-user.ts
```
Then test the sources endpoint:
```bash
# Login first
curl -s -c cookies.txt -X POST http://localhost:3847/shieldtest/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testadmin","password":"testpassword123"}'

# List sources
curl -s -b cookies.txt http://localhost:3847/shieldtest/api/sources | python3 -m json.tool
```
Expected: JSON with 6 sources

Cleanup: `kill %1 && rm cookies.txt`

- [ ] **Step 3: Commit lockfile if changed**

```bash
git add package-lock.json
git commit -m "chore: update lockfile after ingestion dependencies" --allow-empty
```

---

## Summary

After completing all 9 tasks:

- 5 source connectors (URLhaus, OpenPhish, PhishTank, Tranco, StevenBlack)
- Hostname normalisation with tldts
- Connector interface with upsert/deduplication logic
- BullMQ worker + scheduler for automated sync
- Source API routes (list, update, trigger sync, sync history, indicator stats)
- 6 pre-seeded sources ready to sync
- Unit tests for normalisation and all connector parse logic

**Next plan:** Plan 3: Benchmark Builder + Probe Agent
