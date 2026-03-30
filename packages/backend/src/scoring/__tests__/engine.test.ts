import { describe, it, expect } from 'vitest';
import { calculateBlockRate, calculateConsistencyScore, calculateLatencyPenalty, calculateOverallScore } from '../engine.js';

describe('calculateBlockRate', () => {
  it('should calculate block rate excluding infrastructure failures', () => {
    const items = [
      { verdict: 'BLOCKED_NXDOMAIN' }, { verdict: 'BLOCKED_SINKHOLE' },
      { verdict: 'ALLOWED' }, { verdict: 'TIMEOUT' }, { verdict: 'DNS_ERROR' },
    ];
    expect(calculateBlockRate(items)).toBeCloseTo(2 / 3, 4);
  });
  it('should return 0 for empty array', () => { expect(calculateBlockRate([])).toBe(0); });
  it('should return 1.0 when all are blocked', () => {
    expect(calculateBlockRate([{ verdict: 'BLOCKED_NXDOMAIN' }, { verdict: 'BLOCKED_BLOCKPAGE' }])).toBe(1);
  });
});

describe('calculateConsistencyScore', () => {
  it('should return 1.0 for first run', () => { expect(calculateConsistencyScore({}, null)).toBe(1.0); });
  it('should return 1.0 when rates identical', () => {
    expect(calculateConsistencyScore({ malware: 0.95 }, { malware: 0.95 })).toBe(1.0);
  });
  it('should reduce for large deltas', () => {
    expect(calculateConsistencyScore({ malware: 0.95 }, { malware: 0.80 })).toBe(0.0);
  });
});

describe('calculateLatencyPenalty', () => {
  it('should return 0 for latency under 200ms', () => { expect(calculateLatencyPenalty(150)).toBe(0); });
  it('should return max 5.0 for very high latency', () => { expect(calculateLatencyPenalty(2000)).toBe(5.0); });
  it('should scale linearly', () => { expect(calculateLatencyPenalty(600)).toBeCloseTo(2.5, 1); });
});

describe('calculateOverallScore', () => {
  it('should produce score between 0 and 100', () => {
    const score = calculateOverallScore({ malwareBlockRate: 0.95, phishingBlockRate: 0.90, adultFilterRate: 0.80, adsTrackerBlockRate: 0.70, cleanAllowRate: 0.98, consistencyScore: 1.0, latencyPenalty: 0 });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
  it('should apply latency penalty', () => {
    const base = calculateOverallScore({ malwareBlockRate: 1, phishingBlockRate: 1, adultFilterRate: 1, adsTrackerBlockRate: 1, cleanAllowRate: 1, consistencyScore: 1, latencyPenalty: 0 });
    const penalised = calculateOverallScore({ malwareBlockRate: 1, phishingBlockRate: 1, adultFilterRate: 1, adsTrackerBlockRate: 1, cleanAllowRate: 1, consistencyScore: 1, latencyPenalty: 5 });
    expect(penalised).toBe(base - 5);
  });
});
