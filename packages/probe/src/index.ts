import { config } from './config.js';
import { pollAndExecute, sendHeartbeat } from './worker.js';

console.log('ShieldTest Probe Agent starting...');
console.log(`Server: ${config.serverUrl}`);
console.log(`Probe ID: ${config.probeId}`);
console.log(`DNS-only mode: ${config.dnsOnly}`);

setInterval(sendHeartbeat, config.heartbeatIntervalMs);
sendHeartbeat();

async function pollLoop() {
  while (true) {
    const hadWork = await pollAndExecute();
    const delay = hadWork ? 500 : config.pollIntervalMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

pollLoop().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
