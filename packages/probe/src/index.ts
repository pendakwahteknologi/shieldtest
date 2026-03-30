import { config } from './config.js';
import { pollAndExecute, sendHeartbeat } from './worker.js';

console.log('');
console.log('  ShieldTest Probe Agent');
console.log('  ──────────────────────');
console.log(`  Server:    ${config.serverUrl}`);
console.log(`  Probe ID:  ${config.probeId}`);
console.log(`  DNS-only:  ${config.dnsOnly}`);
console.log('');
console.log('  Waiting for benchmark jobs...');
console.log('');

// Track work state
let totalItemsTested = 0;
let hasSeenWork = false;
let idleCountAfterWork = 0;
const MAX_IDLE_POLLS_AFTER_WORK = 5;

// Heartbeat
const heartbeatInterval = setInterval(sendHeartbeat, config.heartbeatIntervalMs);
sendHeartbeat();

function shutdown(message: string) {
  clearInterval(heartbeatInterval);
  console.log('');
  console.log(`  ✓ ${message}`);
  console.log(`  ✓ Total domains tested: ${totalItemsTested}`);
  console.log(`  ✓ Results submitted to server`);
  console.log('');
  console.log('  View your results at: https://my6.my/shieldtest/runs');
  console.log('');
  process.exit(0);
}

async function pollLoop() {
  while (true) {
    const { hadWork, itemCount } = await pollAndExecute();

    if (hadWork) {
      hasSeenWork = true;
      idleCountAfterWork = 0;
      totalItemsTested += itemCount;
    } else if (hasSeenWork) {
      // We had work before but now there's nothing — the run is likely done
      idleCountAfterWork++;
      if (idleCountAfterWork >= MAX_IDLE_POLLS_AFTER_WORK) {
        shutdown('Benchmark complete — all jobs processed');
        return;
      }
    }

    const delay = hadWork ? 500 : config.pollIntervalMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  shutdown('Probe stopped by user');
});

pollLoop().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
