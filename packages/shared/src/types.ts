// Verdict enum — standardised probe result classifications
export const Verdict = {
  ALLOWED: 'ALLOWED',
  BLOCKED_NXDOMAIN: 'BLOCKED_NXDOMAIN',
  BLOCKED_SINKHOLE: 'BLOCKED_SINKHOLE',
  BLOCKED_BLOCKPAGE: 'BLOCKED_BLOCKPAGE',
  TIMEOUT: 'TIMEOUT',
  DNS_ERROR: 'DNS_ERROR',
  TLS_ERROR: 'TLS_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type Verdict = (typeof Verdict)[keyof typeof Verdict];

// Indicator categories
export const IndicatorCategory = {
  MALWARE: 'malware',
  PHISHING: 'phishing',
  ADULT: 'adult',
  ADS: 'ads',
  TRACKER: 'tracker',
  CLEAN: 'clean',
} as const;

export type IndicatorCategory = (typeof IndicatorCategory)[keyof typeof IndicatorCategory];

// Source types
export const SourceType = {
  THREAT: 'threat',
  CLEAN: 'clean',
  CATEGORY: 'category',
} as const;

export type SourceType = (typeof SourceType)[keyof typeof SourceType];

// Benchmark run status
export const RunStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

// Sync run status
export const SyncStatus = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

// Probe status
export const ProbeStatus = {
  ONLINE: 'online',
  OFFLINE: 'offline',
} as const;

export type ProbeStatus = (typeof ProbeStatus)[keyof typeof ProbeStatus];

// Sampling mode
export const SamplingMode = {
  BALANCED: 'balanced',
  WEIGHTED: 'weighted',
} as const;

export type SamplingMode = (typeof SamplingMode)[keyof typeof SamplingMode];

// Evidence JSON structure from probe
export interface EvidenceJson {
  dns: {
    addresses: string[];
    rcode: string;
    duration_ms: number;
  };
  http?: {
    status_code: number;
    headers: Record<string, string>;
    duration_ms: number;
  };
  error?: string;
}

// API error response
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Letter grade
export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';
