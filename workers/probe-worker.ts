import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/queue/connection';
import { QUEUE_NAMES, getPersistenceQueue, getIncidentQueue } from '../lib/queue/queues';
import type { CheckRequestJob, CheckResultJob } from '../lib/queue/queues';
import { runDistributedCheck } from '../lib/monitor-checker';

const persistenceQueue = getPersistenceQueue();
const incidentQueue = getIncidentQueue();

const worker = new Worker<CheckRequestJob>(
  QUEUE_NAMES.MONITOR_CHECKS,
  async (job: Job<CheckRequestJob>) => {
    const { monitorId, url, region, name, userId } = job.data;

    console.log(
      `[probe-worker] Checking monitor ${monitorId} (${name}) → ${url}`
    );

    const result = await runDistributedCheck(url, region);

    const resultJob: CheckResultJob = {
      monitorId,
      url,
      name,
      userId,
      timestamp: new Date().toISOString(),
      regionResults: result.regionResults.map((r) => ({
        region: r.region,
        status: r.status,
        responseTime: r.responseTime,
        code: r.code,
        errorType: r.errorType,
        source: r.source,
      })),
      aggregated: {
        status: result.status,
        responseTime: result.responseTime,
        code: result.code,
        downVotes: result.downVotes,
        degradedVotes: result.degradedVotes,
        upVotes: result.upVotes,
        quorum: result.quorum,
        totalRegions: result.totalRegions,
        retryAfterSeconds: result.retryAfterSeconds,
        redirectStatus: result.redirectStatus,
        finalUrl: result.finalUrl,
      },
    };

    // Fan out: add result to both queues
    await Promise.all([
      persistenceQueue.add('persist-result', resultJob, {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      }),
      incidentQueue.add('evaluate-incident', resultJob, {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      })
    ]);

    console.log(
      `[probe-worker] Result for ${name}: ${result.status} (${result.upVotes}/${result.totalRegions} UP)`
    );
  },
  {
    connection: createRedisConnection(),
    concurrency: 4,
  }
);

worker.on('completed', (job) => {
  console.log(`[probe-worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[probe-worker] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[probe-worker] Worker error:', err);
});

console.log('[probe-worker] Started, waiting for jobs...');

// Graceful shutdown
const shutdown = async () => {
  console.log('[probe-worker] Shutting down...');
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
