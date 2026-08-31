import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/queue/connection';
import { QUEUE_NAMES, getNotificationsQueue } from '../lib/queue/queues';
import type { CheckResultJob, NotificationJob } from '../lib/queue/queues';
import { prisma } from '../lib/prisma';
import { findRootCause } from '../lib/graph-utils';

const DOWN_ALERT_CONSECUTIVE_CHECKS = Math.max(
  1,
  Number(process.env.MONITOR_DOWN_ALERT_CONSECUTIVE_CHECKS ?? '2')
);

const notificationsQueue = getNotificationsQueue();

async function enqueueNotification(
  userId: string,
  event: 'DOWN' | 'RECOVERY',
  monitorName: string,
  monitorUrl: string,
  httpCode: number | null,
  responseTime: number
) {
  const notificationJob: NotificationJob = {
    userId,
    event,
    monitorName,
    monitorUrl,
    httpCode,
    responseTime,
  };

  await notificationsQueue.add(event, notificationJob);
  console.log(
    `[incident-worker] Enqueued ${event} notification for ${monitorName}`
  );
}

const worker = new Worker<CheckResultJob>(
  QUEUE_NAMES.CHECK_RESULTS_INCIDENT,
  async (job: Job<CheckResultJob>) => {
    const result = job.data;
    const { monitorId } = result;
    const status = result.aggregated.status;

    if (status === 'DOWN') {
      const recentChecks = await prisma.check.findMany({
        where: { monitorId },
        orderBy: { createdAt: 'desc' },
        take: DOWN_ALERT_CONSECUTIVE_CHECKS + 1,
        select: { status: true },
      });

      const recentWindow = recentChecks.slice(0, DOWN_ALERT_CONSECUTIVE_CHECKS);
      const previousWindow = recentChecks.slice(1, DOWN_ALERT_CONSECUTIVE_CHECKS + 1);

      const hasConfirmedConsecutiveDown =
        recentWindow.length === DOWN_ALERT_CONSECUTIVE_CHECKS &&
        recentWindow.every((c) => c.status === 'DOWN');

      if (!hasConfirmedConsecutiveDown) {
        console.log(
          `[incident-worker] ${result.name}: DOWN but below threshold`
        );
        return;
      }

      const hadConfirmedConsecutiveDown =
        previousWindow.length === DOWN_ALERT_CONSECUTIVE_CHECKS &&
        previousWindow.every((c) => c.status === 'DOWN');

      const rootCauseId = await findRootCause(monitorId);
      const isRootCause = rootCauseId === monitorId;

      await prisma.$transaction(async (tx) => {
        const existing = await tx.incident.findFirst({
          where: { monitorId, status: { not: 'RESOLVED' } },
        });

        if (existing) return;

        const timelineMessage = isRootCause
          ? `Monitor detected as DOWN (${result.aggregated.downVotes}/${result.aggregated.totalRegions} regions failing, quorum ${result.aggregated.quorum}, HTTP ${result.aggregated.code ?? 'timeout'}, ${result.aggregated.responseTime}ms avg)`
          : `Suppressed: Awaiting upstream recovery from root cause monitor.`;

        await tx.incident.create({
          data: {
            monitorId,
            summary: `${result.name} is down`,
            status: 'INVESTIGATING',
            timeline: {
              create: {
                status: 'INVESTIGATING',
                message: timelineMessage,
              },
            },
          },
        });
      });

      if (!hadConfirmedConsecutiveDown) {
        if (isRootCause) {
          await enqueueNotification(
            result.userId,
            'DOWN',
            result.name,
            result.url,
            result.aggregated.code,
            result.aggregated.responseTime
          );
        } else {
          console.log(
            `[incident-worker] Suppressed DOWN alert for ${result.name} (root cause: ${rootCauseId})`
          );
        }
      }
    } else if (status === 'UP') {
      const openIncidents = await prisma.incident.findMany({
        where: { monitorId, status: { not: 'RESOLVED' } },
      });

      for (const incident of openIncidents) {
        await prisma.incident.update({
          where: { id: incident.id },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            timeline: {
              create: {
                status: 'RESOLVED',
                message: `Monitor is back UP (${result.aggregated.upVotes}/${result.aggregated.totalRegions} regions healthy)`,
              },
            },
          },
        });
      }

      if (openIncidents.length > 0) {
        await enqueueNotification(
          result.userId,
          'RECOVERY',
          result.name,
          result.url,
          result.aggregated.code,
          result.aggregated.responseTime
        );
      }
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  }
);

worker.on('failed', (job, err) => {
  console.error(`[incident-worker] Job ${job?.id} failed:`, err.message);
});

console.log('[incident-worker] Started, waiting for jobs...');

const shutdown = async () => {
  console.log('[incident-worker] Shutting down...');
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
