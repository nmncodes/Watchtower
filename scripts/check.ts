import 'dotenv/config';
import { runDistributedCheck, getGlobalpingRateLimitRemaining } from '../lib/monitor-checker';
// patch update

const targetUrl = process.argv[2] || 'https://google.com';

async function main() {
  console.log('\n============================================================');
  console.log(`  Watchtower 5-Continent Global Probe`);
  console.log(`  Target: ${targetUrl}`);
  console.log('============================================================\n');

  const start = Date.now();
  const res = await runDistributedCheck(targetUrl, 'USA');
  const elapsed = Date.now() - start;

  console.log(`  Overall Status: ${res.status}`);
  console.log(`  Avg Response Time: ${res.responseTime}ms`);
  console.log(`  Quorum: ${res.upVotes}/${res.totalRegions} UP`);
  console.log(`  Probe Execution Time: ${elapsed}ms\n`);

  console.log('  Region        Latency    HTTP    Status   Source');
  console.log('  ---------------------------------------------------------');
  for (const r of res.regionResults) {
    const region = r.region.padEnd(13);
    const latency = `${r.responseTime}ms`.padEnd(10);
    const httpCode = `${r.code ?? '-'}`.padEnd(7);
    const status = r.status.padEnd(8);
    const source = r.source === 'edge' ? 'Globalping (real edge)' : 'local fallback';
    console.log(`  ${region} ${latency} ${httpCode} ${status} ${source}`);
  }

  const remaining = getGlobalpingRateLimitRemaining();
  if (remaining !== null) {
    console.log('  ------------------------------------------------');
    console.log(`  API Rate Limit Remaining: ${remaining} / 500 requests this hour`);
  }
  console.log('============================================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
