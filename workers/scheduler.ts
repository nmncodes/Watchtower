import { getMonitorChecksQueue } from '../lib/queue/queues';
import type { CheckRequestJob } from '../lib/queue/queues';
import { prisma } from '../lib/prisma';
import { createRedisConnection } from '../lib/queue/connection';

const MIN_EFFECTIVE_INTERVAL_SECONDS = Number(
  process.env.MONITOR_MIN_EFFECTIVE_INTERVAL_SECONDS ?? "30"
);

// We still need a redis connection to ensure the queue can connect
createRedisConnection();

async function runSchedule() {
  try {
    const now = new Date();
    
    const monitors = await prisma.monitor.findMany({
      where: { status: { not: "PAUSED" } },
      include: {
        dependencies: { select: { id: true } },
      },
    });

    const due = monitors.filter((m) => {
      if (!m.lastCheckAt) return true;
      const elapsed = (now.getTime() - m.lastCheckAt.getTime()) / 1000;
      const effectiveInterval = Math.max(
        m.interval,
        MIN_EFFECTIVE_INTERVAL_SECONDS
      );
      return elapsed >= effectiveInterval;
    });

    if (due.length > 0) {
      const queue = getMonitorChecksQueue();
      const jobs = due.map((m) => {
        const payload: CheckRequestJob = {
          monitorId: m.id,
          url: m.url,
          region: m.region,
          name: m.name,
          userId: m.userId,
          interval: m.interval,
          dependencyIds: m.dependencies.map((d) => d.id),
        };
        return {
          name: 'scheduled-check',
          data: payload,
          opts: {
            jobId: `cron-${m.id}-${now.getTime()}`,
            removeOnComplete: true,
            removeOnFail: true,
          }
        };
      });

      await queue.addBulk(jobs);
      console.log(`[scheduler] Enqueued ${due.length} due monitors at ${now.toISOString()}`);
    }
  } catch (error) {
    console.error("[scheduler] Failed to run schedule:", error);
  }
}

console.log('[scheduler] Started internal clock (checking every 30s)...');

// Run immediately on boot
runSchedule();

// Run every 30 seconds
const interval = setInterval(runSchedule, 30000);

const shutdown = async () => {
  console.log('[scheduler] Shutting down...');
  clearInterval(interval);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
