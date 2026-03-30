import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ── Users ──────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Sessions ───────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Sources ────────────────────────────────────────────
export const sources = pgTable('sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  type: varchar('type', { length: 20 }).notNull(),
  url: text('url').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  refreshIntervalMins: integer('refresh_interval_mins').default(360).notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Source Sync Runs ───────────────────────────────────
export const sourceSyncRuns = pgTable('source_sync_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(),
  recordsFetched: integer('records_fetched').default(0).notNull(),
  recordsAdded: integer('records_added').default(0).notNull(),
  recordsSkipped: integer('records_skipped').default(0).notNull(),
  errorsJson: jsonb('errors_json').$type<Array<{ line: number; raw: string; reason: string }>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_sync_runs_source_started').on(table.sourceId, table.startedAt),
]);

// ── Indicators ─────────────────────────────────────────
export const indicators = pgTable('indicators', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  hostname: varchar('hostname', { length: 500 }).notNull(),
  registrableDomain: varchar('registrable_domain', { length: 500 }),
  fullUrl: text('full_url'),
  category: varchar('category', { length: 20 }).notNull(),
  confidence: integer('confidence').default(50).notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_indicators_hostname_source').on(table.hostname, table.sourceId),
  index('idx_indicators_hostname').on(table.hostname),
  index('idx_indicators_category_active').on(table.category, table.isActive),
]);

// ── Benchmark Profiles ─────────────────────────────────
export const benchmarkProfiles = pgTable('benchmark_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sampleSizePerCategory: integer('sample_size_per_category').default(100).notNull(),
  recencyWindowDays: integer('recency_window_days').default(30).notNull(),
  minConfidence: integer('min_confidence').default(50).notNull(),
  samplingMode: varchar('sampling_mode', { length: 20 }).default('balanced').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Probe Agents ───────────────────────────────────────
export const probeAgents = pgTable('probe_agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  ipAddress: varchar('ip_address', { length: 45 }),
  status: varchar('status', { length: 20 }).default('offline').notNull(),
  concurrencyLimit: integer('concurrency_limit').default(5).notNull(),
  timeoutMs: integer('timeout_ms').default(5000).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_probe_agents_token').on(table.tokenHash),
]);

// ── Benchmark Runs ─────────────────────────────────────
export const benchmarkRuns = pgTable('benchmark_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => benchmarkProfiles.id, { onDelete: 'restrict' }),
  probeId: uuid('probe_id').references(() => probeAgents.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  routerName: varchar('router_name', { length: 255 }),
  firmwareVersion: varchar('firmware_version', { length: 100 }),
  resolverMode: varchar('resolver_mode', { length: 255 }),
  notes: text('notes'),
  totalItems: integer('total_items').default(0).notNull(),
  completedItems: integer('completed_items').default(0).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_benchmark_runs_status').on(table.status),
]);

// ── Benchmark Run Items ────────────────────────────────
export const benchmarkRunItems = pgTable('benchmark_run_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull().references(() => benchmarkRuns.id, { onDelete: 'cascade' }),
  indicatorId: uuid('indicator_id').references(() => indicators.id, { onDelete: 'set null' }),
  hostname: varchar('hostname', { length: 500 }).notNull(),
  category: varchar('category', { length: 20 }).notNull(),
  verdict: varchar('verdict', { length: 30 }),
  latencyMs: integer('latency_ms'),
  evidenceJson: jsonb('evidence_json'),
  testedAt: timestamp('tested_at', { withTimezone: true }),
}, (table) => [
  index('idx_run_items_run').on(table.runId),
  index('idx_run_items_indicator').on(table.indicatorId),
]);

// ── Scorecards ─────────────────────────────────────────
export const scorecards = pgTable('scorecards', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull().references(() => benchmarkRuns.id, { onDelete: 'cascade' }).unique(),
  malwareBlockRate: real('malware_block_rate'),
  phishingBlockRate: real('phishing_block_rate'),
  adultFilterRate: real('adult_filter_rate'),
  adsTrackerBlockRate: real('ads_tracker_block_rate'),
  cleanAllowRate: real('clean_allow_rate'),
  consistencyScore: real('consistency_score'),
  latencyPenalty: real('latency_penalty'),
  overallScore: real('overall_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── App Settings ───────────────────────────────────────
export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  valueJson: jsonb('value_json').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Audit Logs ─────────────────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }),
  entityId: uuid('entity_id'),
  detailsJson: jsonb('details_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_audit_logs_created').on(table.createdAt),
  index('idx_audit_logs_entity').on(table.entityType, table.entityId),
]);
