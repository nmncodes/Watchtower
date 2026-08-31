import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/queue/connection';
import { QUEUE_NAMES } from '../lib/queue/queues';
import type { NotificationJob } from '../lib/queue/queues';
import { prisma } from '../lib/prisma';
import {
  sendEmailNotification,
  sendWebhookNotification,
} from '../lib/notifications';
import type { NotificationPayload } from '../lib/notifications';

const worker = new Worker<NotificationJob>(
  QUEUE_NAMES.NOTIFICATIONS,
  async (job: Job<NotificationJob>) => {
    const notification = job.data;

    console.log(
      `[notification-worker] Processing ${notification.event} notification for ${notification.monitorName}`
    );

    const channels = await prisma.notificationChannel.findMany({
      where: { userId: notification.userId, enabled: true },
    });

    if (channels.length === 0) {
      console.log(
        `[notification-worker] No enabled channels for user ${notification.userId}`
      );
      return;
    }

    const payload: NotificationPayload = {
      monitorName: notification.monitorName,
      monitorUrl: notification.monitorUrl,
      event: notification.event,
      httpCode: notification.httpCode,
      responseTime: notification.responseTime,
    };

    // Note: If one channel fails, we throw an error which tells BullMQ to retry the entire job.
    // In a fully optimized setup, each channel dispatch would be its own sub-job, 
    // but throwing here correctly utilizes BullMQ's exponential backoff.
    for (const channel of channels) {
      if (channel.type === 'EMAIL') {
        await sendEmailNotification(channel.target, payload);
      } else if (channel.type === 'WEBHOOK') {
        await sendWebhookNotification(channel.target, payload);
      }
      console.log(
        `[notification-worker] Sent ${channel.type} to ${channel.target}`
      );
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  }
);

worker.on('failed', (job, err) => {
  // If it fails, BullMQ automatically schedules a retry using the backoff config.
  // After all attempts are exhausted, the job stays in the 'failed' list (acts as DLQ).
  console.error(
    `[notification-worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`
  );
});

console.log('[notification-worker] Started, waiting for jobs...');

const shutdown = async () => {
  console.log('[notification-worker] Shutting down...');
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
