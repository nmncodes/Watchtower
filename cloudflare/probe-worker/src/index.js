const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_DEGRADED_THRESHOLD_MS = 5000;

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname !== "/" && requestUrl.pathname !== "/probe") {
      return jsonResponse({ error: "Not Found" }, 404);
    }

    if (request.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "watchtower-probe",
        contractVersion: "watchtower-probe-v1",
        region: (env.PROBE_REGION ?? "edge").toString(),
        colo: request.cf?.colo ?? null,
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method Not Allowed" }, 405, { allow: "GET, POST" });
    }

    const expectedToken = (env.PROBE_AUTH_TOKEN ?? "").toString().trim();
    if (expectedToken) {
      const authHeader = request.headers.get("authorization") ?? "";
      const providedToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";

      if (!providedToken || providedToken !== expectedToken) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const targetUrl =
      body && typeof body.url === "string"
        ? body.url.trim()
        : "";

    if (!targetUrl) {
      return jsonResponse({ error: "Field 'url' is required" }, 400);
    }

    if (!isHttpUrl(targetUrl)) {
      return jsonResponse({ error: "Field 'url' must be a valid http/https URL" }, 400);
    }

    const requestedRegion =
      body && typeof body.region === "string" && body.region.trim()
        ? body.region.trim()
        : (env.PROBE_REGION ?? "edge").toString();

    const timeoutMs = clampInt(
      Number(env.PROBE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
      1000,
      30000,
      DEFAULT_TIMEOUT_MS
    );
    const degradedThresholdMs = clampInt(
      Number(env.PROBE_DEGRADED_THRESHOLD_MS ?? DEFAULT_DEGRADED_THRESHOLD_MS),
      500,
      30000,
      DEFAULT_DEGRADED_THRESHOLD_MS
    );
    const policy429 = get429Policy((env.PROBE_429_POLICY ?? "UP").toString());

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "user-agent": "WatchtowerCloudflareProbe/1.0",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
      });

      const responseTime = Date.now() - start;
      const code = response.status;
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
      const status =
        code === 429
          ? map429Status(policy429)
          : classifyHttpStatus(code, responseTime, response.headers, degradedThresholdMs);

      const payload = {
        region: requestedRegion,
        status,
        responseTime,
        code,
        retryAfterSeconds,
        errorType: status === "DOWN" ? "HTTP" : "NONE",
        contractVersion: "watchtower-probe-v1",
        probe: {
          provider: "cloudflare-workers",
          colo: request.cf?.colo ?? null,
          country: request.cf?.country ?? null,
        },
      };

      return jsonResponse(payload, 200);
    } catch (error) {
      const responseTime = Date.now() - start;
      return jsonResponse(
        {
          region: requestedRegion,
          status: "DOWN",
          responseTime,
          code: null,
          retryAfterSeconds: null,
          errorType: classifyProbeError(error),
          contractVersion: "watchtower-probe-v1",
          probe: {
            provider: "cloudflare-workers",
            colo: request.cf?.colo ?? null,
            country: request.cf?.country ?? null,
          },
        },
        200
      );
    } finally {
      clearTimeout(timer);
    }
  },
};

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function clampInt(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function get429Policy(raw) {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "DOWN") return "DOWN";
  if (normalized === "DEGRADED") return "DEGRADED";
  return "UP";
}

function map429Status(policy) {
  if (policy === "DOWN") return "DOWN";
  if (policy === "DEGRADED") return "DEGRADED";
  return "UP";
}

function parseRetryAfterSeconds(value) {
  if (!value) return null;

  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.floor(asSeconds);
  }

  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    const diffSeconds = Math.ceil((asDate - Date.now()) / 1000);
    return diffSeconds > 0 ? diffSeconds : null;
  }

  return null;
}

function isLikelyWafResponse(code, headers) {
  if (code < 400) return false;

  const server = (headers.get("server") ?? "").toLowerCase();
  const via = (headers.get("via") ?? "").toLowerCase();
  const wafHints = ["cloudflare", "akamai", "imperva", "incapsula", "sucuri", "f5"];
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

function classifyHttpStatus(code, responseTime, headers, degradedThresholdMs) {
  if (code >= 200 && code < 400) {
    return responseTime > degradedThresholdMs ? "DEGRADED" : "UP";
  }

  if (code >= 400 && code < 500) {
    if (code === 403 && isLikelyWafResponse(code, headers)) {
      return "UP";
    }
    return "DEGRADED";
  }

  if (code >= 500) {
    if ((code === 503 || (code >= 520 && code <= 530)) && isLikelyWafResponse(code, headers)) {
      return "DEGRADED";
    }
    return "DOWN";
  }

  return "DEGRADED";
}

function classifyProbeError(error) {
  if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
    return "TIMEOUT";
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error ?? "").toLowerCase();

  if (message.includes("timed out") || message.includes("timeout")) return "TIMEOUT";
  if (message.includes("enotfound") || message.includes("dns")) return "DNS";
  if (message.includes("tls") || message.includes("ssl") || message.includes("certificate")) return "TLS";
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
