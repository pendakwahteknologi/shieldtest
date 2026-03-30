import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  serverUrl: required('SERVER_URL'),
  probeId: required('PROBE_ID'),
  probeToken: required('PROBE_TOKEN'),
  dnsOnly: process.env.DNS_ONLY === 'true',
  blockPageIps: (process.env.BLOCK_PAGE_IPS || '').split(',').filter(Boolean),
  blockPageSignatures: (process.env.BLOCK_PAGE_SIGNATURES || '').split(',').filter(Boolean),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '3000', 10),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),
} as const;
