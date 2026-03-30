import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { createUrlhausConnector } from '../urlhaus.js';
import { createOpenPhishConnector } from '../openphish.js';
import { createPhishTankConnector } from '../phishtank.js';
import { createTrancoConnector } from '../tranco.js';
import { createStevenBlackConnector } from '../stevenblack.js';

beforeEach(() => {
  mockFetch.mockReset();
});

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
    const feedData = [
      { phish_id: '1', url: 'https://phish1.example.com/login', verified: 'yes', online: 'yes' },
      { phish_id: '2', url: 'https://phish2.example.com/bank', verified: 'yes', online: 'yes' },
      { phish_id: '3', url: 'https://phish3.example.com/fake', verified: 'no', online: 'yes' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(feedData),
    });

    const connector = createPhishTankConnector('https://data.phishtank.com/data/online-valid.json');
    const result = await connector.fetch();

    expect(result.records.length).toBe(2);
    expect(result.records[0].category).toBe('phishing');
    expect(result.records[0].confidence).toBe(80);
  });
});

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
