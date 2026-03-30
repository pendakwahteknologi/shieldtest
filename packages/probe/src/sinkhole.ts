const SINKHOLE_IPS = new Set([
  '0.0.0.0',
  '0.0.0.1',
  '127.0.0.1',
  '::1',
  '146.112.61.104',
  '146.112.61.105',
  '185.228.168.10',
  '185.228.169.11',
]);

export function isSinkhole(ip: string): boolean {
  return SINKHOLE_IPS.has(ip);
}
