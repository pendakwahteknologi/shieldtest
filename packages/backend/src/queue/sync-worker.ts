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
import { createFeodoConnector } from '../ingestion/feodo.js';
import { createThreatFoxConnector } from '../ingestion/threatfox.js';
import { createCoinBlockerConnector } from '../ingestion/coinblocker.js';
import type { SourceConnector } from '../ingestion/connector.js';

const CONNECTOR_MAP: Record<string, (url: string) => SourceConnector> = {
  urlhaus: (url) => createUrlhausConnector(url),
  openphish: (url) => createOpenPhishConnector(url),
  phishtank: (url) => createPhishTankConnector(url),
  tranco: (url) => createTrancoConnector(url),
  'stevenblack-ads': (url) => createStevenBlackConnector(url, 'ads'),
  'stevenblack-adult': (url) => createStevenBlackConnector(url, 'adult'),
  feodo: (url) => createFeodoConnector(url),
  threatfox: (url) => createThreatFoxConnector(url),
  coinblocker: (url) => createCoinBlockerConnector(url),
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
