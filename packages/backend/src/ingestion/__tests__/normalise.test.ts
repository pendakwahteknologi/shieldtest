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
