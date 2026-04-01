# Cloudflare Regional Probe Worker

This worker implements the Watchtower probe endpoint contract consumed by the distributed checker.

## Endpoint Contract

- `GET /probe` or `GET /`
  - Health check and identity metadata.
- `POST /probe` or `POST /`
  - Request JSON:
    - `url` (string, required)
    - `region` (string, optional, echoed back)
  - Header:
    - `Authorization: Bearer <MONITOR_REGION_PROBE_AUTH_TOKEN>` when auth token is enabled.
  - Response JSON:
    - `region`
    - `status` (`UP` | `DEGRADED` | `DOWN`)
    - `responseTime` (ms)
    - `code` (HTTP status or `null`)
    - `retryAfterSeconds` (`number | null`)
    - `errorType` (`NONE` | `TIMEOUT` | `DNS` | `TLS` | `CONNECT` | `HTTP` | `UNKNOWN`)
    - `contractVersion`
    - `probe` metadata (`provider`, `colo`, `country`)

## Deploy

1. Install Wrangler and login:
   - `pnpm dlx wrangler login`
2. Set shared auth secret (repeat per env):
   - `pnpm dlx wrangler secret put PROBE_AUTH_TOKEN --config cloudflare/probe-worker/wrangler.toml --env us_east_1`
3. Deploy each region worker:
   - `pnpm dlx wrangler deploy --config cloudflare/probe-worker/wrangler.toml --env us_east_1`
   - `pnpm dlx wrangler deploy --config cloudflare/probe-worker/wrangler.toml --env us_west_2`
   - `pnpm dlx wrangler deploy --config cloudflare/probe-worker/wrangler.toml --env eu_west_1`
   - `pnpm dlx wrangler deploy --config cloudflare/probe-worker/wrangler.toml --env ap_south_1`
   - `pnpm dlx wrangler deploy --config cloudflare/probe-worker/wrangler.toml --env ap_southeast_1`

Each deployed env returns a `workers.dev` URL in deploy output.

## Ready Watchtower Mapping

After deploy, set these app env vars:

```env
MONITOR_DISTRIBUTED_REGIONS="us-east-1,us-west-2,eu-west-1,ap-south-1,ap-southeast-1"
MONITOR_REGION_PROBE_AUTH_TOKEN="replace-with-the-same-secret-used-in-worker"
MONITOR_REGION_PROBE_ENDPOINTS='{"us-east-1":"https://watchtower-probe-use1.<your-subdomain>.workers.dev/probe","us-west-2":"https://watchtower-probe-usw2.<your-subdomain>.workers.dev/probe","eu-west-1":"https://watchtower-probe-euw1.<your-subdomain>.workers.dev/probe","ap-south-1":"https://watchtower-probe-aps1.<your-subdomain>.workers.dev/probe","ap-southeast-1":"https://watchtower-probe-apse1.<your-subdomain>.workers.dev/probe"}'
```

Optional tuning:

```env
MONITOR_REGION_FAILURE_RETRIES=1
MONITOR_REGION_FAILURE_RETRY_DELAY_MS=1000
MONITOR_DOWN_QUORUM_RATIO=0.6
MONITOR_CHECK_TIMEOUT_MS=10000
```

## Notes

- Keep `MONITOR_REGION_PROBE_AUTH_TOKEN` and `PROBE_AUTH_TOKEN` identical.
- If an endpoint returns non-OK without a valid probe payload, Watchtower treats that region as `DOWN`.
- Worker runs at Cloudflare edge and returns colo/country metadata to aid debugging.
