import { Queue } from 'bullmq';
import { createRedisConnection } from './connection';

/**
 * Queue names used throughout the application.
 */
export const QUEUE_NAMES = {
  MONITOR_CHECKS: 'monitor-checks',
  CHECK_RESULTS_PERSISTENCE: 'check-results-persistence',
  CHECK_RESULTS_INCIDENT: 'check-results-incident',
  NOTIFICATIONS: 'notifications',
} as const;

/**
 * Job data for a monitor check request.
 */
export interface CheckRequestJob {
  monitorId: string;
  url: string;
  region: string;
  name: string;
  userId: string;
  interval: number;
  dependencyIds: string[];
}

/**
 * Job data for a completed check result (produced by probe worker).
 */
export interface CheckResultJob {
  monitorId: string;
  url: string;
  name: string;
  userId: string;
  timestamp: string;
  regionResults: Array<{
    region: string;
    status: string;
    responseTime: number;
    code: number | null;
    errorType: string;
    source: string;
  }>;
  aggregated: {
    status: string;
    responseTime: number;
    code: number | null;
    downVotes: number;
    degradedVotes: number;
    upVotes: number;
    quorum: number;
    totalRegions: number;
    retryAfterSeconds: number | null;
    redirectStatus: number | null;
    finalUrl: string | null;
  };
}

/**
 * Job data for a notification dispatch request.
 */
export interface NotificationJob {
  userId: string;
  event: 'DOWN' | 'RECOVERY';
  monitorName: string;
  monitorUrl: string;
  httpCode: number | null;
  responseTime: number;
}

// ── Queue Instances (lazy singletons) ──

let _monitorChecksQueue: Queue<CheckRequestJob> | null = null;
let _persistenceQueue: Queue<CheckResultJob> | null = null;
let _incidentQueue: Queue<CheckResultJob> | null = null;
let _notificationsQueue: Queue<NotificationJob> | null = null;

export function getMonitorChecksQueue(): Queue<CheckRequestJob> {
  if (!_monitorChecksQueue) {
    _monitorChecksQueue = new Queue(QUEUE_NAMES.MONITOR_CHECKS, {
      connection: createRedisConnection(),
    });
  }
  return _monitorChecksQueue;
}

export function getPersistenceQueue(): Queue<CheckResultJob> {
  if (!_persistenceQueue) {
    _persistenceQueue = new Queue(QUEUE_NAMES.CHECK_RESULTS_PERSISTENCE, {
      connection: createRedisConnection(),
    });
  }
  return _persistenceQueue;
}

export function getIncidentQueue(): Queue<CheckResultJob> {
  if (!_incidentQueue) {
    _incidentQueue = new Queue(QUEUE_NAMES.CHECK_RESULTS_INCIDENT, {
      connection: createRedisConnection(),
    });
  }
  return _incidentQueue;
}

export function getNotificationsQueue(): Queue<NotificationJob> {
  if (!_notificationsQueue) {
    _notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return _notificationsQueue;
}
