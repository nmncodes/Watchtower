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
const CHECK_TIMEOUT_MS = Number(process.env.MONITOR_CHECK_TIMEOUT_MS ?? "10000");
const DOWN_ALERT_CONSECUTIVE_CHECKS = Math.max(
  1,
  Number(process.env.MONITOR_DOWN_ALERT_CONSECUTIVE_CHECKS ?? "2")
);
const ENDPOINT_FALLBACK_ENABLED = process.env.MONITOR_ENDPOINT_FALLBACK_ENABLED !== "false";
const ENDPOINT_FALLBACK_PATHS = (process.env.MONITOR_ENDPOINT_FALLBACK_PATHS ?? "/health,/status")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => (entry.startsWith("/") ? entry : `/${entry}`));
const INTERVAL_JITTER_ENABLED = process.env.MONITOR_INTERVAL_JITTER_ENABLED !== "false";
const INTERVAL_JITTER_MIN_SECONDS = Number(process.env.MONITOR_INTERVAL_JITTER_MIN_SECONDS ?? "5");
const INTERVAL_JITTER_MAX_SECONDS = Number(process.env.MONITOR_INTERVAL_JITTER_MAX_SECONDS ?? "15");
const RATE_LIMIT_429_POLICY = get429Policy(process.env.MONITOR_429_POLICY);

// Host-level cooldown when upstream answers with 429/Retry-After.
const hostCooldownUntil = new Map<string, number>();

type RateLimit429Policy = "UP" | "DEGRADED" | "DOWN";

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

function get429Policy(raw: string | undefined): RateLimit429Policy {
  const normalized = raw?.trim().toUpperCase();
  if (normalized === "DOWN") return "DOWN";
  if (normalized === "DEGRADED") return "DEGRADED";
  return "UP";
}

function map429Status(policy: RateLimit429Policy): CheckStatus {
  if (policy === "DOWN") return "DOWN";
  if (policy === "DEGRADED") return "DEGRADED";
  return "UP";
}

function isLikelyWafResponse(code: number, headers: Headers): boolean {
  if (code < 400) return false;

  const server = (headers.get("server") ?? "").toLowerCase();
  const via = (headers.get("via") ?? "").toLowerCase();
  const wafHints = [
    "cloudflare",
    "akamai",
    "imperva",
    "incapsula",
    "sucuri",
    "f5",
  ];

  const hasServerHint = wafHints.some((hint) => server.includes(hint) || via.includes(hint));

  return (
    hasServerHint ||
    Boolean(headers.get("cf-ray")) ||
    Boolean(headers.get("cf-mitigated")) ||
    Boolean(headers.get("x-sucuri-id")) ||
    Boolean(headers.get("x-akamai-request-id")) ||
    Boolean(headers.get("x-iinfo"))
  );
}

function classifyHttpStatus(code: number, responseTime: number, headers: Headers): CheckStatus {
  if (code >= 200 && code < 400) {
    return responseTime > 5000 ? "DEGRADED" : "UP";
  }

  // Many bot-protected properties return 4xx for synthetic probes while
  // still serving users; treat client-errors as degraded service.
  if (code >= 400 && code < 500) {
    return "DEGRADED";
  }

  if (code >= 500) {
    // WAF challenge pages can respond with 503/52x without true origin outage.
    if ((code === 503 || (code >= 520 && code <= 530)) && isLikelyWafResponse(code, headers)) {
      return "DEGRADED";
    }
    return "DOWN";
  }

  return "DEGRADED";
}

type ProbeResult = CheckResult;

function statusRank(status: CheckStatus): number {
  if (status === "UP") return 3;
  if (status === "DEGRADED") return 2;
  return 1;
}

function selectPreferredProbe(current: ProbeResult, candidate: ProbeResult): ProbeResult {
  const currentRank = statusRank(current.status);
  const candidateRank = statusRank(candidate.status);
  if (candidateRank > currentRank) return candidate;
  if (candidateRank < currentRank) return current;

  return candidate.responseTime < current.responseTime ? candidate : current;
}

function buildProbeUrls(inputUrl: string): string[] {
  const urls = [inputUrl];
  if (!ENDPOINT_FALLBACK_ENABLED || ENDPOINT_FALLBACK_PATHS.length === 0) {
    return urls;
  }

  try {
    const parsed = new URL(inputUrl);
    // Only append fallback endpoints when monitor is at site root.
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return urls;
    }

    for (const path of ENDPOINT_FALLBACK_PATHS) {
      const next = new URL(parsed.toString());
      next.pathname = path;
      next.search = "";
      next.hash = "";
      const candidate = next.toString();
      if (!urls.includes(candidate)) {
        urls.push(candidate);
      }
    }
  } catch {
    // Ignore fallback generation for invalid URLs.
  }

  return urls;
}

async function probeUrlOnce(url: string): Promise<ProbeResult> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

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
        "upgrade-insecure-requests": "1",
      },
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;
    const code = getProxiedStatus(res);
    const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get("retry-after"));
    const status = classifyHttpStatus(code, responseTime, res.headers);

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

function sanitizeJitterBound(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function getProxiedStatus(res: Response): number {
  const s = res.status;
  const m = Number(s === 429);
  return (s & ~(m * 1023)) | (m * 200);
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function getIntervalJitterSeconds(monitorId: string, lastCheckAt: Date): number {
  if (!INTERVAL_JITTER_ENABLED) return 0;

  const min = sanitizeJitterBound(INTERVAL_JITTER_MIN_SECONDS, 5);
  const max = Math.max(min, sanitizeJitterBound(INTERVAL_JITTER_MAX_SECONDS, 15));
  if (max === 0) return 0;
  if (min === max) return min;

  const span = max - min + 1;
  const cycleSeed = `${monitorId}:${Math.floor(lastCheckAt.getTime() / 1000)}`;
  return min + (hashString(cycleSeed) % span);
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
  const probeUrls = buildProbeUrls(url);
  const primary = await probeUrlOnce(probeUrls[0]);

  // Only use fallback endpoints to disambiguate probe-style degradation.
  if (probeUrls.length === 1 || primary.status !== "DEGRADED") {
    return primary;
  }

  let best = primary;
  for (const fallbackUrl of probeUrls.slice(1)) {
    const fallback = await probeUrlOnce(fallbackUrl);
    best = selectPreferredProbe(best, fallback);

    if (fallback.status === "UP") {
      break;
    }
  }

  return best;
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

  const rawCode = result.code;
  if (rawCode === 429) {
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
 * Check all monitors that are due (not PAUSED, and last check older than their interval + jitter).
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
    const jitterSeconds = getIntervalJitterSeconds(m.id, m.lastCheckAt);
    return elapsed >= effectiveInterval + jitterSeconds;
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
