import { prisma } from "@/lib/prisma";
import type { CheckStatus, MonitorStatus } from "@/lib/generated/prisma/client";
import { sendNotifications } from "@/lib/notifications";

export interface CheckResult {
  status: CheckStatus;
  responseTime: number;
  code: number | null;
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
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;
    const code = res.status;

    let status: CheckStatus;
    if (code >= 200 && code < 400) {
      status = responseTime > 5000 ? "DEGRADED" : "UP";
    } else if (code >= 400) {
      status = "DOWN";
    } else {
      status = "DEGRADED";
    }

    return { status, responseTime, code };
  } catch {
    return {
      status: "DOWN",
      responseTime: Date.now() - start,
      code: null,
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

  const result = await pingUrl(monitor.url);

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

  // 4. Handle incidents
  if (result.status === "DOWN") {
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

    // Send DOWN notification on status change, or on the very first check
    if (statusChanged || !monitor.lastCheckAt) {
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

    // Send RECOVERY notification only on status change from DOWN
    if (statusChanged && previousStatus === "DOWN") {
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
    if (!m.lastCheckAt) return true; // never checked
    const elapsed = (now.getTime() - m.lastCheckAt.getTime()) / 1000;
    return elapsed >= m.interval;
  });

  const results = await Promise.allSettled(
    due.map((m) => checkMonitor(m.id))
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
