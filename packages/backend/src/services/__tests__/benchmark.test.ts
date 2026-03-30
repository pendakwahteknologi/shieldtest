import { describe, it, expect } from 'vitest';
import { buildSampleSet } from '../benchmark.js';

describe('buildSampleSet', () => {
  const indicators = [
    { id: '1', hostname: 'evil1.com', category: 'malware', confidence: 90 },
    { id: '2', hostname: 'evil2.com', category: 'malware', confidence: 80 },
    { id: '3', hostname: 'evil3.com', category: 'malware', confidence: 70 },
    { id: '4', hostname: 'phish1.com', category: 'phishing', confidence: 85 },
    { id: '5', hostname: 'phish2.com', category: 'phishing', confidence: 75 },
    { id: '6', hostname: 'clean1.com', category: 'clean', confidence: 95 },
    { id: '7', hostname: 'clean2.com', category: 'clean', confidence: 85 },
  ];

  it('should sample up to sampleSize per category', () => {
    const result = buildSampleSet(indicators, { sampleSize: 2, minConfidence: 0 });
    const malware = result.filter((i) => i.category === 'malware');
    const phishing = result.filter((i) => i.category === 'phishing');
    expect(malware.length).toBe(2);
    expect(phishing.length).toBe(2);
  });

  it('should filter by minimum confidence', () => {
    const result = buildSampleSet(indicators, { sampleSize: 10, minConfidence: 80 });
    expect(result.every((i) => i.confidence >= 80)).toBe(true);
  });

  it('should return all if sample size exceeds available', () => {
    const result = buildSampleSet(indicators, { sampleSize: 100, minConfidence: 0 });
    expect(result.length).toBe(7);
  });
});
