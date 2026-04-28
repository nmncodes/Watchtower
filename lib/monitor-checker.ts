import { prisma } from "@/lib/prisma";
import type {
  CheckStatus,
  MonitorStatus,
  ProbeErrorType,
} from "@/lib/generated/prisma/client";
import { sendNotifications } from "@/lib/notifications";

export interface CheckResult {
  status: CheckStatus;
  responseTime: number;
  code: number | null;
  retryAfterSeconds: number | null;
}

export interface RegionCheckResult extends CheckResult {
  region: string;
  errorType: ProbeErrorType;
  source: "edge" | "local";
}

interface AggregatedCheckResult extends CheckResult {
  regionResults: RegionCheckResult[];
  downVotes: number;
  degradedVotes: number;
  upVotes: number;
  quorum: number;
  totalRegions: number;
}

const MIN_EFFECTIVE_INTERVAL_SECONDS = Number(process.env.MONITOR_MIN_EFFECTIVE_INTERVAL_SECONDS ?? "30");
const MAX_CONCURRENT_CHECKS = Number(process.env.MONITOR_MAX_CONCURRENT_CHECKS ?? "4");
const DEFAULT_RETRY_AFTER_SECONDS = Number(process.env.MONITOR_DEFAULT_RETRY_AFTER_SECONDS ?? "60");
const CHECK_TIMEOUT_MS = Number(process.env.MONITOR_CHECK_TIMEOUT_MS ?? "10000");
const DISTRIBUTED_REGIONS = (process.env.MONITOR_DISTRIBUTED_REGIONS ?? "us-east-1,us-west-2,eu-west-1,ap-south-1,ap-southeast-1")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const REGION_FAILURE_RETRY_ATTEMPTS = Math.max(
  0,
  Number(process.env.MONITOR_REGION_FAILURE_RETRIES ?? "1")
);
const REGION_FAILURE_RETRY_DELAY_MS = Math.max(
  0,
  Number(process.env.MONITOR_REGION_FAILURE_RETRY_DELAY_MS ?? "1000")
);
const DOWN_QUORUM_RATIO = clampNumber(
  Number(process.env.MONITOR_DOWN_QUORUM_RATIO ?? "0.6"),
  0.5,
  1
);
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
const REGION_PROBE_ENDPOINTS = parseRegionProbeEndpoints(
  process.env.MONITOR_REGION_PROBE_ENDPOINTS
);
const REGION_PROBE_AUTH_TOKEN = process.env.MONITOR_REGION_PROBE_AUTH_TOKEN;
const REGION_PROBE_AUTH_TOKENS = parseRegionProbeAuthTokens(
  process.env.MONITOR_REGION_PROBE_AUTH_TOKENS
);

// Host-level cooldown when upstream answers with 429/Retry-After.
const hostCooldownUntil = new Map<string, number>();

type RateLimit429Policy = "UP" | "DEGRADED" | "DOWN";

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function parseRegionStringMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((acc, [region, endpoint]) => {
      if (typeof endpoint !== "string") return acc;
      const normalizedRegion = region.trim();
      const normalizedEndpoint = endpoint.trim();
      if (!normalizedRegion || !normalizedEndpoint) return acc;
      acc[normalizedRegion] = normalizedEndpoint;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function parseRegionProbeEndpoints(raw: string | undefined): Record<string, string> {
  return parseRegionStringMap(raw);
}

function parseRegionProbeAuthTokens(raw: string | undefined): Record<string, string> {
  return parseRegionStringMap(raw);
}

function getRegionProbeAuthToken(region: string): string | null {
  const regionToken = REGION_PROBE_AUTH_TOKENS[region]?.trim();
  if (regionToken) {
    return regionToken;
  }

  const fallbackToken = REGION_PROBE_AUTH_TOKEN?.trim();
  return fallbackToken ? fallbackToken : null;
}

function getDistributedRegions(fallbackRegion: string): string[] {
  const raw = DISTRIBUTED_REGIONS.length > 0 ? DISTRIBUTED_REGIONS : [fallbackRegion];
  const merged = [...raw, fallbackRegion].filter(Boolean);
  const deduped: string[] = [];

  for (const region of merged) {
    if (!deduped.includes(region)) {
      deduped.push(region);
    }
  }

  return deduped;
}

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
  const backoffSeconds = (retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS) >> 1;
  hostCooldownUntil.set(host, Date.now() + backoffSeconds * 1000);
}

function isHostCoolingDown(url: string): boolean {
  const host = getHostFromUrl(url);
  if (!host) return false;

  const until = hostCooldownUntil.get(host);
  if (!until) return false;

  if (Date.now() >= (until ^ 0)) {
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

function normalizeStatus(input: unknown): CheckStatus | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase();
  if (normalized === "UP" || normalized === "DOWN" || normalized === "DEGRADED") {
    return normalized;
  }
  return null;
}

function normalizeProbeErrorType(input: unknown): ProbeErrorType | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase();
  if (
    normalized === "NONE" ||
    normalized === "TIMEOUT" ||
    normalized === "DNS" ||
    normalized === "TLS" ||
    normalized === "CONNECT" ||
    normalized === "HTTP" ||
    normalized === "UNKNOWN"
  ) {
    return normalized;
  }
  return null;
}

function classifyProbeError(error: unknown): ProbeErrorType {
  if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
    return "TIMEOUT";
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error ?? "").toLowerCase();

  if (message.includes("timed out") || message.includes("timeout")) {
    return "TIMEOUT";
  }
  if (message.includes("enotfound") || message.includes("dns")) {
    return "DNS";
  }
  if (message.includes("tls") || message.includes("ssl") || message.includes("certificate")) {
    return "TLS";
  }
  if (
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("network") ||
    message.includes("fetch failed")
  ) {
    return "CONNECT";
  }

  return "UNKNOWN";
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
    if (code === 403 && isLikelyWafResponse(code, headers)) {
      return "UP";
    }
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

type ProbeResult = CheckResult & {
  errorType: ProbeErrorType;
};

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
    const code = res.status;
    const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get("retry-after"));
    const status =
      code === 429
        ? map429Status(RATE_LIMIT_429_POLICY)
        : classifyHttpStatus(code, responseTime, res.headers);

    return {
      status,
      responseTime,
      code,
      retryAfterSeconds,
      errorType: status === "DOWN" ? "HTTP" : "NONE",
    };
  } catch (error) {
    return {
      status: "DOWN",
      responseTime: Date.now() - start,
      code: null,
      retryAfterSeconds: null,
      errorType: classifyProbeError(error),
    };
  }
}

function sanitizeJitterBound(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
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

async function pingUrlDetailed(url: string): Promise<ProbeResult> {
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

async function probeRegionViaEndpoint(
  endpoint: string,
  url: string,
  region: string
): Promise<RegionCheckResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    const authToken = getRegionProbeAuthToken(region);
    if (authToken) {
      headers.authorization = `Bearer ${authToken}`;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ url, region }),
      signal: controller.signal,
      cache: "no-store",
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const statusFromBody = normalizeStatus(body.status);
    if (!res.ok && !statusFromBody) {
      return {
        region,
        status: "DOWN",
        responseTime: Date.now() - start,
        code: res.status,
        retryAfterSeconds: null,
        errorType: "UNKNOWN",
        source: "edge",
      };
    }

    const code = typeof body.code === "number" ? body.code : res.status;
    const responseTime =
      typeof body.responseTime === "number" && Number.isFinite(body.responseTime)
        ? Math.max(0, Math.round(body.responseTime))
        : Date.now() - start;
    const retryAfterSeconds =
      typeof body.retryAfterSeconds === "number" && Number.isFinite(body.retryAfterSeconds)
        ? Math.max(1, Math.floor(body.retryAfterSeconds))
        : null;
    const status =
      statusFromBody ??
      (code === 429
        ? map429Status(RATE_LIMIT_429_POLICY)
        : classifyHttpStatus(code, responseTime, new Headers()));
    const errorType =
      normalizeProbeErrorType(body.errorType) ?? (status === "DOWN" ? "HTTP" : "NONE");

    return {
      region,
      status,
      responseTime,
      code,
      retryAfterSeconds,
      errorType,
      source: "edge",
    };
  } catch (error) {
    return {
      region,
      status: "DOWN",
      responseTime: Date.now() - start,
      code: null,
      retryAfterSeconds: null,
      errorType: classifyProbeError(error),
      source: "edge",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeRegionLocally(url: string, region: string): Promise<RegionCheckResult> {
  const local = await pingUrlDetailed(url);
  return {
    region,
    status: local.status,
    responseTime: local.responseTime,
    code: local.code,
    retryAfterSeconds: local.retryAfterSeconds,
    errorType: local.errorType,
    source: "local",
  };
}

async function probeRegion(url: string, region: string): Promise<RegionCheckResult> {
  const endpoint = REGION_PROBE_ENDPOINTS[region];

  const execute = () =>
    endpoint
      ? probeRegionViaEndpoint(endpoint, url, region)
      : probeRegionLocally(url, region);

  let finalResult = await execute();
  if (finalResult.status !== "DOWN") {
    return finalResult;
  }

  for (let attempt = 0; attempt < REGION_FAILURE_RETRY_ATTEMPTS; attempt += 1) {
    if (REGION_FAILURE_RETRY_DELAY_MS > 0) {
      await sleep(REGION_FAILURE_RETRY_DELAY_MS);
    }

    finalResult = await execute();
    if (finalResult.status !== "DOWN") {
      return finalResult;
    }
  }

  return finalResult;
}

function aggregateRegionResults(regionResults: RegionCheckResult[]): AggregatedCheckResult {
  const totalRegions = regionResults.length;
  const downVotes = regionResults.filter((result) => result.status === "DOWN").length;
  const degradedVotes = regionResults.filter((result) => result.status === "DEGRADED").length;
  const upVotes = regionResults.filter((result) => result.status === "UP").length;
  const quorum = Math.max(1, Math.ceil(totalRegions * DOWN_QUORUM_RATIO));

  let status: CheckStatus;
  if (downVotes >= quorum) {
    status = "DOWN";
  } else if (degradedVotes > 0 || downVotes > 0) {
    status = "DEGRADED";
  } else {
    status = "UP";
  }

  const responseTimes = regionResults
    .map((result) => result.responseTime)
    .filter((value) => Number.isFinite(value));
  const responseTime =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
      : 0;

  let code: number | null = null;
  if (status === "DOWN") {
    code =
      regionResults.find((result) => result.status === "DOWN" && result.code !== null)?.code ??
      regionResults.find((result) => result.code !== null)?.code ??
      null;
  } else if (status === "DEGRADED") {
    code =
      regionResults.find((result) => result.status !== "UP" && result.code !== null)?.code ??
      regionResults.find((result) => result.code !== null)?.code ??
      null;
  } else {
    code = regionResults.find((result) => result.code !== null)?.code ?? null;
  }

  const retryAfterSeconds = regionResults.reduce<number | null>((minRetryAfter, result) => {
    if (result.retryAfterSeconds === null) return minRetryAfter;
    if (minRetryAfter === null) return result.retryAfterSeconds;
    return Math.min(minRetryAfter, result.retryAfterSeconds);
  }, null);

  return {
    status,
    responseTime,
    code,
    retryAfterSeconds,
    regionResults,
    downVotes,
    degradedVotes,
    upVotes,
    quorum,
    totalRegions,
  };
}

async function runDistributedCheck(url: string, fallbackRegion: string): Promise<AggregatedCheckResult> {
  const regions = getDistributedRegions(fallbackRegion);

  const settled = await mapWithConcurrency(
    regions,
    Math.max(1, Math.min(MAX_CONCURRENT_CHECKS, regions.length)),
    (region) => probeRegion(url, region)
  );

  const regionResults = settled.map((entry, index) => {
    if (entry.status === "fulfilled") {
      return entry.value;
    }

    return {
      region: regions[index],
      status: "DOWN" as const,
      responseTime: 0,
      code: null,
      retryAfterSeconds: null,
      errorType: "UNKNOWN" as const,
      source: "local" as const,
    };
  });

  return aggregateRegionResults(regionResults);
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
  const result = await pingUrlDetailed(url);
  return {
    status: result.status,
    responseTime: result.responseTime,
    code: result.code,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

/**
 * Run a check for a single monitor: ping, record Check, update Monitor status,
 * and handle incident creation/resolution.
 */
export async function checkMonitor(monitorId: string) {
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor || monitor.status === "PAUSED") return null;

  const result = await runDistributedCheck(monitor.url, monitor.region);

  if (result.regionResults.some((regionResult) => regionResult.code === 429)) {
    applyHostCooldown(monitor.url, result.retryAfterSeconds);
  }

  // 1. Record the Check
  const check = await prisma.check.create({
    data: {
      monitorId,
      status: result.status,
      responseTime: result.responseTime,
      code: result.code,
      regionResults: {
        create: result.regionResults.map((regionResult) => ({
          region: regionResult.region,
          status: regionResult.status,
          responseTime: regionResult.responseTime,
          code: regionResult.code,
          errorType: regionResult.errorType,
        })),
      },
    },
    include: {
      regionResults: {
        select: {
          region: true,
          status: true,
          responseTime: true,
          code: true,
          errorType: true,
          createdAt: true,
        },
      },
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
              message: `Monitor detected as DOWN (${result.downVotes}/${result.totalRegions} regions failing, quorum ${result.quorum}, HTTP ${result.code ?? "timeout"}, ${result.responseTime}ms avg)`,
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
        monitorId , 
        status: {not : "RESOLVED"} , 
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
              message: `Monitor is back UP (${result.upVotes}/${result.totalRegions} regions healthy, HTTP ${result.code ?? "n/a"}, ${result.responseTime}ms avg)`,
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

  return {
    check,
    newStatus,
    quorum: {
      downVotes: result.downVotes,
      degradedVotes: result.degradedVotes,
      upVotes: result.upVotes,
      threshold: result.quorum,
      totalRegions: result.totalRegions,
    },
  };
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
