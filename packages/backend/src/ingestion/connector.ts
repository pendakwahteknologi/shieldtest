import { eq, and } from 'drizzle-orm';
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

  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);

    for (const record of batch) {
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

    await db
      .update(schema.sources)
      .set({ lastSyncedAt: new Date() })
      .where(eq(schema.sources.id, sourceId));

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
