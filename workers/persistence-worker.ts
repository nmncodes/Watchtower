import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/queue/connection';
import { QUEUE_NAMES } from '../lib/queue/queues';
import type { CheckResultJob } from '../lib/queue/queues';
import { prisma } from '../lib/prisma';
import { WRITE_ONLY_ON_CHANGE } from '../lib/config';
import type { CheckStatus, ProbeErrorType } from '../lib/generated/prisma/client';

const worker = new Worker<CheckResultJob>(
  QUEUE_NAMES.CHECK_RESULTS_PERSISTENCE,
  async (job: Job<CheckResultJob>) => {
    const msg = job.data;
    const newStatus = msg.aggregated.status as CheckStatus;

    if (WRITE_ONLY_ON_CHANGE) {
      const monitor = await prisma.monitor.findUnique({
        where: { id: msg.monitorId },
        select: { status: true },
      });
      const previousStatus = monitor?.status;
      const statusChanged = previousStatus !== newStatus;

      if (!statusChanged && previousStatus !== 'DOWN') {
        console.log(
          `[persistence-worker] SKIPPING check row for ${msg.monitorId} (no change)`
        );
        await prisma.monitor.update({
          where: { id: msg.monitorId },
          data: { status: newStatus, lastCheckAt: new Date(msg.timestamp) },
        });
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.check.create({
        data: {
          monitorId: msg.monitorId,
          status: msg.aggregated.status as CheckStatus,
          responseTime: msg.aggregated.responseTime,
          code: msg.aggregated.code,
          redirectStatus: msg.aggregated.redirectStatus,
          finalUrl: msg.aggregated.finalUrl,
          regionResults: {
            create: msg.regionResults.map((r) => ({
              region: r.region,
              status: r.status as CheckStatus,
              responseTime: r.responseTime,
              code: r.code,
              errorType: r.errorType as ProbeErrorType,
            })),
          },
        },
      });

      await tx.monitor.update({
        where: { id: msg.monitorId },
        data: { status: newStatus, lastCheckAt: new Date(msg.timestamp) },
      });
    });

    console.log(`[persistence-worker] WROTE check row for ${msg.monitorId}`);
  },
  {
    connection: createRedisConnection(),
    concurrency: 10,
  }
);

worker.on('failed', (job, err) => {
  console.error(`[persistence-worker] Job ${job?.id} failed:`, err.message);
});

console.log('[persistence-worker] Started, waiting for jobs...');

const shutdown = async () => {
  console.log('[persistence-worker] Shutting down...');
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
