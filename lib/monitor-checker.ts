import { prisma } from "@/lib/prisma";
import type { CheckStatus, MonitorStatus } from "@/lib/generated/prisma/client";
import { sendNotifications } from "@/lib/notifications";

export interface CheckResult {
  status: CheckStatus;
  responseTime: number;
  code: number | null;
  retryAfterSeconds: number | null;
}

const MIN_EFFECTIVE_INTERVAL_SECONDS = Number(process.env.MONITOR_MIN_EFFECTIVE_INTERVAL_SECONDS ?? "30");
const MAX_CONCURRENT_CHECKS = Number(process.env.MONITOR_MAX_CONCURRENT_CHECKS ?? "4");
const DEFAULT_RETRY_AFTER_SECONDS = Number(process.env.MONITOR_DEFAULT_RETRY_AFTER_SECONDS ?? "60");
const FAILURE_CONFIRMATION_CHECKS = Number(process.env.MONITOR_FAILURE_CONFIRMATION_CHECKS ?? "2");
const FAILURE_CONFIRMATION_DELAY_MS = Number(process.env.MONITOR_FAILURE_CONFIRMATION_DELAY_MS ?? "1500");
const DOWN_ALERT_CONSECUTIVE_CHECKS = Math.max(
  1,
  Number(process.env.MONITOR_DOWN_ALERT_CONSECUTIVE_CHECKS ?? "2")
);

// Host-level cooldown when upstream answers with 429/Retry-After.
const hostCooldownUntil = new Map<string, number>();

function getHostFromUrl(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function parseRetryAfterSeconds(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) return null;

  const asSeconds = Number(retryAfterHeader);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.floor(asSeconds);
  }

  const asDate = Date.parse(retryAfterHeader);
  if (!Number.isNaN(asDate)) {
    const diffSeconds = Math.ceil((asDate - Date.now()) / 1000);
    return diffSeconds > 0 ? diffSeconds : null;
  }

  return null;
}

function applyHostCooldown(url: string, retryAfterSeconds: number | null) {
  const host = getHostFromUrl(url);
  if (!host) return;
  const backoffSeconds = retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
  hostCooldownUntil.set(host, Date.now() + backoffSeconds * 1000);
}

function isHostCoolingDown(url: string): boolean {
  const host = getHostFromUrl(url);
  if (!host) return false;

  const until = hostCooldownUntil.get(host);
  if (!until) return false;

  if (Date.now() >= until) {
    hostCooldownUntil.delete(host);
    return false;
  }

  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirmDownStatus(url: string, initial: CheckResult): Promise<CheckResult> {
  if (initial.status !== "DOWN") return initial;

  let finalResult = initial;

  for (let i = 0; i < Math.max(0, FAILURE_CONFIRMATION_CHECKS); i += 1) {
    if (FAILURE_CONFIRMATION_DELAY_MS > 0) {
      await sleep(FAILURE_CONFIRMATION_DELAY_MS);
    }

    const probe = await pingUrl(url);
    finalResult = probe;

    // If any confirmation probe is not DOWN, treat it as recovered/transient.
    if (probe.status !== "DOWN") {
      return probe;
    }
  }

  return finalResult;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      try {
        const value = await mapper(items[index]);
        results[index] = { status: "fulfilled", value };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(safeLimit, items.length) }, () => worker())
  );

  return results;
}

/**
 * Ping a single URL and return the check result.
 * Timeout after 10 seconds.
 */
export async function pingUrl(url: string): Promise<CheckResult> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 WatchtowerMonitor/1.2",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1"
      },
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;
    const code = res.status;
    const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get("retry-after"));

    let status: CheckStatus;
    if (code >= 200 && code < 400) {
      status = responseTime > 5000 ? "DEGRADED" : "UP";
    } else if (code >= 400) {
      status = "DOWN";
    } else {
      status = "DEGRADED";
    }

    return { status, responseTime, code, retryAfterSeconds };
  } catch {
    return {
      status: "DOWN",
      responseTime: Date.now() - start,
      code: null,
      retryAfterSeconds: null,
    };
  }
}

/**
 * Run a check for a single monitor: ping, record Check, update Monitor status,
 * and handle incident creation/resolution.
 */
export async function checkMonitor(monitorId: string) {
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor || monitor.status === "PAUSED") return null;

  const firstResult = await pingUrl(monitor.url);
  const result = await confirmDownStatus(monitor.url, firstResult);

  if (result.code === 429) {
    applyHostCooldown(monitor.url, result.retryAfterSeconds);
  }

  // 1. Record the Check
  const check = await prisma.check.create({
    data: {
      monitorId,
      status: result.status,
      responseTime: result.responseTime,
      code: result.code,
    },
  });

  // 2. Update Monitor status & lastCheckAt
  const newStatus: MonitorStatus = result.status === "UP" ? "UP" : result.status === "DOWN" ? "DOWN" : "DEGRADED";

  await prisma.monitor.update({
    where: { id: monitorId },
    data: { status: newStatus, lastCheckAt: new Date() },
  });

  // 3. Determine if status actually changed (for notifications)
  const previousStatus = monitor.status;
  const statusChanged = previousStatus !== newStatus;

  const recentChecks = await prisma.check.findMany({
    where: { monitorId },
    orderBy: { createdAt: "desc" },
    take: DOWN_ALERT_CONSECUTIVE_CHECKS + 1,
    select: { status: true },
  });

  const recentWindow = recentChecks.slice(0, DOWN_ALERT_CONSECUTIVE_CHECKS);
  const previousWindow = recentChecks.slice(1, DOWN_ALERT_CONSECUTIVE_CHECKS + 1);

  const hasConfirmedConsecutiveDown =
    recentWindow.length === DOWN_ALERT_CONSECUTIVE_CHECKS &&
    recentWindow.every((c) => c.status === "DOWN");

  const hadConfirmedConsecutiveDown =
    previousWindow.length === DOWN_ALERT_CONSECUTIVE_CHECKS &&
    previousWindow.every((c) => c.status === "DOWN");

  // 4. Handle incidents
  if (result.status === "DOWN") {
    if (!hasConfirmedConsecutiveDown) {
      return { check, newStatus };
    }

    // Check if there's already an open incident for this monitor
    const openIncident = await prisma.incident.findFirst({
      where: {
        monitorId,
        status: { not: "RESOLVED" },
      },
    });

    if (!openIncident) {
      // Create a new incident
      await prisma.incident.create({
        data: {
          monitorId,
          summary: `${monitor.name} is down`,
          status: "INVESTIGATING",
          timeline: {
            create: {
              status: "INVESTIGATING",
              message: `Monitor detected as DOWN (HTTP ${result.code ?? "timeout"}, ${result.responseTime}ms)`,
            },
          },
        },
      });
    }

    // Send DOWN notification only when crossing the consecutive-failure threshold.
    if (!hadConfirmedConsecutiveDown && (statusChanged || !monitor.lastCheckAt || previousStatus === "DOWN")) {
      sendNotifications(monitor.userId, {
        monitorName: monitor.name,
        monitorUrl: monitor.url,
        event: "DOWN",
        httpCode: result.code,
        responseTime: result.responseTime,
      }).catch((err) => console.error("Notification error:", err));
    }
  } else if (result.status === "UP") {
    // Auto-resolve any open incidents for this monitor
    const openIncidents = await prisma.incident.findMany({
      where: {
        monitorId,
        status: { not: "RESOLVED" },
      },
    });

    for (const incident of openIncidents) {
      await prisma.incident.update({
        where: { id: incident.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          timeline: {
            create: {
              status: "RESOLVED",
              message: `Monitor is back UP (HTTP ${result.code}, ${result.responseTime}ms)`,
            },
          },
        },
      });
    }

    // Send recovery only if we actually resolved an open incident.
    if (openIncidents.length > 0) {
      sendNotifications(monitor.userId, {
        monitorName: monitor.name,
        monitorUrl: monitor.url,
        event: "RECOVERY",
        httpCode: result.code,
        responseTime: result.responseTime,
      }).catch((err) => console.error("Notification error:", err));
    }
  }

  return { check, newStatus };
}

/**
 * Check all monitors that are due (not PAUSED, and last check older than their interval).
 */
export async function checkAllDueMonitors() {
  const now = new Date();

  const monitors = await prisma.monitor.findMany({
    where: {
      status: { not: "PAUSED" },
    },
  });

  const due = monitors.filter((m) => {
    if (isHostCoolingDown(m.url)) return false;
    if (!m.lastCheckAt) return true; // never checked
    const elapsed = (now.getTime() - m.lastCheckAt.getTime()) / 1000;
    const effectiveInterval = Math.max(m.interval, MIN_EFFECTIVE_INTERVAL_SECONDS);
    return elapsed >= effectiveInterval;
  });

  const results = await mapWithConcurrency(
    due,
    MAX_CONCURRENT_CHECKS,
    (m) => checkMonitor(m.id)
  );

  return {
    total: monitors.length,
    checked: due.length,
    results: results.map((r, i) => ({
      monitorId: due[i].id,
      name: due[i].name,
      outcome: r.status === "fulfilled" ? r.value : r.reason?.message,
    })),
  };
}
