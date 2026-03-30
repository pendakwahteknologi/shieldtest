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
  const existingJobs = await syncQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await syncQueue.removeRepeatableByKey(job.key);
  }

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
