import IORedis from 'ioredis';

export const QUEUE_ENABLED = process.env.QUEUE_ENABLED === 'true';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Shared Redis connection for BullMQ queues and workers.
 * BullMQ requires an ioredis-compatible connection.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });
}
