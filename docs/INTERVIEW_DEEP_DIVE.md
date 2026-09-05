# Watchtower: End-to-End Technical Deep Dive and Interview Guide

> **Audience:** someone presenting Watchtower in a technical interview, demo, code review, or architecture discussion.
>
> **What this is:** a code-informed explanation of the application as it is implemented, plus questions that an interviewer may ask beyond the repository. It deliberately separates implemented behaviour from recommended production hardening.

---

## 1. The project in one sentence

Watchtower is a multi-tenant uptime-monitoring platform: users define HTTP(S) monitors, the platform probes them on a schedule (optionally from several probe endpoints), records availability and latency, opens or resolves incidents, sends alerts, and exposes selected services through public status pages.

### A 30-second interview answer

"I built Watchtower to turn a URL check into an operational workflow. A user creates a monitor, then a scheduler finds due monitors and either checks them directly or pushes work to BullMQ. Probe results are classified as UP, DEGRADED, or DOWN, aggregated using a regional quorum, persisted in PostgreSQL through Prisma, and used to manage incident lifecycles and notifications. The dashboard is a Next.js App Router application, while public status pages deliberately expose only selected monitor data. The main engineering themes are asynchronous processing, false-positive reduction, data ownership, and safe outbound HTTP."

### A 90-second answer

"Watchtower is comparable in problem space to UptimeRobot or Better Uptime, at a smaller scale. The product has three paths: a protected dashboard where users manage monitors, incidents, notification channels, and status pages; a monitoring control plane that schedules checks and turns results into incidents; and a public read path for status pages. The web layer uses Next.js route handlers, TypeScript, Zod, NextAuth, and Prisma on Neon Postgres. For scale, it can use Redis and BullMQ to decouple scheduling, probing, persistence, incident evaluation, and notification delivery. It can also call a Cloudflare Worker probe contract and aggregate several regional results; a monitor is DOWN only when a configurable majority/quorum fails, which reduces one-region false alarms. I would be candid that the repository is an early production design: I would add distributed rate limiting, strong job idempotency, transactional/outbox event handling, metrics and tracing, and tighter SSRF controls before presenting it as a hardened SaaS."

---

## 2. Problem, users, and scope

### Problem being solved

When a public website or API is unavailable, slow, misconfigured, or returning server errors, a team needs to know quickly and communicate accurately. A successful solution needs more than `fetch(url)`:

- A reliable schedule that does not overload monitored systems.
- Classification that avoids treating every unusual HTTP response as a total outage.
- Enough history for latency, uptime, and incident investigation.
- Alert de-duplication so users are not paged for a transient failure.
- Tenant isolation: one account must not read or modify another account's monitors.
- A safe public surface for customers who need a status page but not a dashboard account.

### Primary user journeys

| Persona | Goal | Watchtower path |
| --- | --- | --- |
| Product/developer team | Detect a failing API endpoint | Create monitor → scheduler/probe → incident/notification |
| Operations engineer | Diagnose where an outage is occurring | Monitor detail → regional results, latency history, incident timeline |
| Team lead | Publish customer-facing availability | Configure a status page → share `/status/[slug]` |
| End customer | Check service health without authenticating | Public status page and public status-page API |

### Deliberate scope limits

The current code focuses on HTTP(S) availability. It does not implement TCP, ICMP, DNS-record, keyword/content, SSL-expiry, or authenticated browser checks. It also has no formal on-call rotations, maintenance windows, role-based authorisation enforcement, billing, SLO burn-rate alerts, or multi-organisation model. These are reasonable next steps, not claims to make in a demo.

---

## 3. Architecture at a glance

```text
                           ┌──────────────────────────────┐
                           │ Browser / React client        │
                           │ dashboard + public status UI  │
                           └──────────────┬───────────────┘
                                          │ HTTPS
┌─────────────────────────────────────────▼──────────────────────────────────────────┐
│ Next.js 16 application (App Router)                                                 │
│                                                                                     │
│ Pages: landing, auth, dashboard, /status/[slug]                                    │
│ Route handlers: monitors, incidents, status pages, channels, cron, health          │
│ Auth: NextAuth v5 (Google OAuth + credentials/JWT)                                 │
└───────┬──────────────────────────┬───────────────────────────┬─────────────────────┘
        │                          │                           │
        │ Prisma + Neon adapter    │ enqueue when enabled      │ external scheduler
        ▼                          ▼                           ▼
┌─────────────────────┐   ┌───────────────────────────┐   ┌─────────────────────────┐
│ Neon PostgreSQL      │   │ Redis + BullMQ            │   │ /api/cron               │
│ users, monitors,    │   │ monitor-checks             │   │ or internal scheduler   │
│ checks, regions,    │   │ persistence                │   └─────────────────────────┘
│ incidents, pages    │   │ incident evaluation        │
└─────────────────────┘   │ notifications              │
                          └──────────┬────────────────┘
                                     │
                      ┌──────────────┼──────────────────┐
                      ▼              ▼                  ▼
           ┌────────────────┐ ┌──────────────┐ ┌──────────────────────┐
           │ Local HTTP GET │ │ Cloudflare   │ │ SMTP / user webhooks │
           │ fallback probe │ │ probe worker │ │ alert delivery       │
           └────────────────┘ └──────────────┘ └──────────────────────┘
```

### Two execution modes

The application intentionally supports two ways of executing checks.

| Mode | Trigger and execution | When it is useful | Important behaviour |
| --- | --- | --- | --- |
| **Synchronous fallback** | `/api/cron` calls `checkAllDueMonitors()` directly when `QUEUE_ENABLED=false` | Simple/local deployments and small monitor counts | Cron request waits for the checks; check persistence, incident updates, and notifications are performed in the process. |
| **Queued pipeline** | Cron/manual check enqueues BullMQ jobs when `QUEUE_ENABLED=true` | More checks, isolation of slow network work, retryable work | Workers probe, fan out results to persistence and incident queues, then dispatch notifications. |

The default in `.env.example` is the synchronous mode. A real deployment must select a single scheduling strategy intentionally; running both the external cron endpoint and the internal `workers/scheduler.ts` at the same time can create duplicate work because there is no distributed scheduler lock.

---

## 4. Technology stack: what it is and why it was chosen

| Layer | Technology in the repository | What it does here | Why it is a sensible fit | Trade-off / interview discussion |
| --- | --- | --- | --- | --- |
| Web framework | Next.js 16, App Router, React 19 | UI pages and API route handlers in one TypeScript project | Fast iteration, file-based routing, server/client component model, easy deployment | A web server is not automatically a good durable background-worker host; separate worker processes are still needed. |
| Language | TypeScript 5.7 | Types for API payloads, ORM results, queues, UI data | Prevents common data-shape errors and enables safer refactors | Types vanish at runtime, so Zod is still needed at untrusted boundaries. |
| Database | PostgreSQL on Neon | Durable product data, time-series-like check records, incidents | Relational integrity, transactions, query flexibility, managed/serverless database | Frequent probe writes need retention, aggregation, and connection-pooling planning at scale. |
| ORM | Prisma 7 + `@prisma/adapter-neon` | Schema, migrations, typed database queries | Ergonomic type-safe data access and relations | ORM does not replace understanding SQL, indexes, transaction isolation, or N+1 queries. |
| Auth | NextAuth/Auth.js v5 | Google OAuth, credentials login, JWT session callback | Avoids writing session protocol and OAuth flow from scratch | Credentials auth still needs brute-force protection, password policy, recovery, verification, and secret rotation. |
| Queue | Redis, BullMQ, ioredis | Job queues and worker consumers | Decouples slow/variable network I/O from the request path; supports retries and concurrency controls | Delivery is at-least-once in practice; handlers must be idempotent and duplicate-safe. |
| Edge probe | Cloudflare Workers | Optional remotely executed probe endpoint | Low operational overhead and a simple HTTP contract | The environment labels are logical labels in code; separate Workers deployments do not alone guarantee a fixed geographic execution region. |
| Validation | Zod | Validates request JSON for monitors, incidents, pages, channels | Keeps runtime validation close to API boundary and produces useful errors | Validation must include security and business rules, not just primitive types. |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI | Dashboard components, dialogs, accessibility primitives | Composable design system with accessible building blocks | shadcn copies components into the repo, so the team owns upgrades and accessibility regression testing. |
| Forms | React Hook Form + Zod resolver | Client-side monitor/settings forms | Good performance and validation integration | The server route must remain authoritative; client validation is a UX enhancement, not security. |
| Charts | Recharts | Response-time charts, sparklines, uptime visuals | Familiar React charting interface | Large datasets must be aggregated/paginated rather than sent raw to the browser. |
| Notifications | Nodemailer + generic webhooks | SMTP email and POST webhook alerts | Simple, provider-neutral first integration | Production systems need per-channel delivery state, signing, rate limits, and audit trails. |

### A useful way to explain "why not just use X?"

- **Why PostgreSQL rather than MongoDB?** The domain is relational: users own monitors; monitors own checks and incidents; incident updates belong to incidents. Postgres transactions and indexes are natural for this model.
- **Why a queue rather than `Promise.all` inside cron?** The queue separates HTTP request duration from probe duration, provides bounded concurrency and retry behaviour, and lets each stage scale independently.
- **Why both Prisma and Zod?** Prisma types the database layer. Zod validates untrusted HTTP input before it reaches that layer. They solve different problems.
- **Why a Cloudflare Worker instead of only a server-side fetch?** A remote probe can make results less dependent on the application host's network. But true independent regional coverage needs deliberately deployed/verified probe infrastructure.

---

## 5. Repository map

```text
app/
  api/                         Route handlers: application API and cron trigger
  auth/                        Login and registration pages
  dashboard/                   Protected dashboard pages
  status/[slug]/               Public status-page UI
components/                    Feature dialogs and shadcn/Radix UI components
lib/
  auth*.ts, session.ts         Authentication and authenticated-user helper
  monitor-checker.ts           Probe logic, status aggregation, synchronous path
  queue/                       BullMQ connection, job contracts, queue factories
  notifications.ts             Email/webhook dispatch
  graph-utils.ts               Monitor dependency traversal
  ssrf.ts, rate-limit.ts       Outbound-URL safety helper and rate limiter
  validations.ts               Zod schemas
prisma/
  schema.prisma                Relational data model
  migrations/                  Schema history
workers/
  scheduler.ts                 Finds due monitors every 30 seconds
  probe-worker.ts              Runs distributed checks and fans out results
  persistence-worker.ts        Stores checks and monitor state
  incident-worker.ts           Opens/resolves incidents and queues alerts
  notification-worker.ts       Delivers queued notifications
cloudflare/probe-worker/
  src/index.js                 Optional remote probe implementation
```

---

## 6. Data model and domain vocabulary

### Core entities

```text
User
 ├── Monitor ──< Check ──< CheckRegionResult
 │      │
 │      └── Incident ──< IncidentUpdate
 │
 ├── StatusPage (stores selected monitor IDs)
 └── NotificationChannel

Monitor ──< MonitorDependencies >── Monitor
```

| Entity | Important fields | Purpose |
| --- | --- | --- |
| `User` | `id`, unique `email`, optional password, role | Tenant boundary and identity. `Role` exists in schema but is not currently used for route authorisation. |
| `Monitor` | URL, interval seconds, selected region label, current status, `lastCheckAt` | The current configuration and latest state of one monitored endpoint. |
| `Check` | status, aggregate response time, HTTP code, redirect metadata, creation time | One historical aggregate observation. Indexed by `(monitorId, createdAt)` for monitor charts. |
| `CheckRegionResult` | region, status, latency, code, error type | Per-probe evidence associated with one check. |
| `Incident` | monitor, status, summary, started/resolved time | Human-readable outage record. |
| `IncidentUpdate` | incident, status, message, timestamp | Timeline information; automatic incidents create entries. |
| `StatusPage` | unique slug, title, public flag, `monitorIds` array | A curated public view of selected monitors. |
| `NotificationChannel` | owner, type (`EMAIL`/`WEBHOOK`), target, enabled | Alert delivery destination. |

### State machines

```text
Monitor status
  PAUSED ──(enable/check)──> UP | DEGRADED | DOWN
  UP/DEGRADED/DOWN ──(pause)──> PAUSED

Incident status
  INVESTIGATING ──> IDENTIFIED ──> MONITORING ──> RESOLVED
       └──────────────── automatic recovery ────────────────────┘
```

The automatic path creates incidents as `INVESTIGATING` after confirmed failures and resolves any open incident on an UP result. Manual API updates can change incident status, but the current PATCH handler does not append a corresponding `IncidentUpdate`; that is a worthwhile consistency improvement.

### Why `Check` and `Monitor.status` both exist

They serve distinct read patterns:

- `Monitor.status` is a fast current-state projection for dashboards and status pages.
- `Check` is immutable-ish historical evidence for charts, uptime, incident diagnosis, and audits.

This is a small form of CQRS/read modelling: duplicating the latest status avoids calculating it from the complete history on every list request. The cost is maintaining consistency between the projection and history, which is why their update needs careful transactional/idempotent design.

### Schema choices an interviewer may challenge

- **`StatusPage.monitorIds` is a string array, not a join table.** It is simple for a small feature, but it weakens referential integrity, makes ownership queries harder, and cannot store per-page monitor metadata such as display order or grouping. A `StatusPageMonitor` join table is better as the product grows.
- **Checks are stored in the transactional database.** Fine early on. At a high check rate, introduce a retention policy, rollups (minute/hour/day), or a time-series solution such as TimescaleDB/ClickHouse.
- **Monitor dependencies are self-referential many-to-many.** This models causal relationships such as `API depends on database`. Cycle detection exists for updates and root-cause traversal follows a failing dependency.

---

## 7. API surface and authorisation

### Endpoint summary

| Area | Endpoint(s) | Main operation | Access control |
| --- | --- | --- | --- |
| Health | `GET /api/health` | Liveness response | Public |
| Auth | `POST /api/auth/register`, NextAuth catch-all route | Register and sign in/out | Public as required by Auth.js |
| Monitors | `GET/POST /api/monitors` | List/create owned monitors | Authenticated |
| Monitor detail | `GET/PATCH/DELETE /api/monitors/:id` | Read/update/delete one owned monitor | Authenticated + owner check |
| Manual run | `POST /api/monitors/:id/check` | Enqueue or perform an owned monitor check | Authenticated + owner check + in-memory rate limit |
| Incidents | `GET/POST /api/incidents`, `GET/PATCH/DELETE /api/incidents/:id` | Managed incident lifecycle | Authenticated + ownership through monitor |
| Status pages | `GET/POST /api/status-pages`, item CRUD | Manage owned status pages | Authenticated + owner check |
| Public status | `GET /api/status-pages/public/:slug` | Selected public page data | Public, only when `isPublic` |
| Channels | Channel CRUD and `/test` | Manage email/webhook destinations | Authenticated + owner check |
| Cron | `GET /api/cron` | Run or enqueue due checks | Shared secret when `CRON_SECRET` is configured |

### Authorisation pattern

Routes first call `getCurrentMonitorActor()`. It obtains the NextAuth session and then confirms that the session user ID still exists in the current database. Resource routes query with both the resource ID and `userId` (or `monitor.userId`) rather than trusting the resource ID alone.

That is the correct core anti-IDOR pattern:

```ts
where: { id: requestedId, userId: actor.userId }
```

An opaque CUID is not authorisation. Even if an attacker cannot easily guess it, every tenant-owned lookup should still constrain it to the authenticated user.

### Validation boundary

Zod schemas protect input shape and basic ranges:

- Monitor URL, name, interval (30–3600 seconds), region, and dependency IDs.
- Incident status and summary length.
- Status-page slug format and selected monitor IDs.
- Notification channel type, name, target, and enabled state.

The routes add business validation, for example verifying that status-page monitors belong to the current user and checking slug uniqueness. This is the right layering: schema validation answers "is this payload well formed?"; business validation answers "is this action allowed and meaningful?"

---

## 8. End-to-end flows

### Flow A: create a monitor

```text
Browser form
  → POST /api/monitors
  → NextAuth session + user existence check
  → Zod validation and URL normalisation (hash removed)
  → short duplicate-window lookup
  → Prisma creates Monitor (initial status UP)
  → direct initial check attempted
  → 201 response with monitor configuration
```

Points to explain:

1. The duplicate window helps with accidental double-clicks/retries but is not a database uniqueness guarantee.
2. The initial check is best effort: the monitor can be created even if the first check fails.
3. Configuration is multi-tenant because `userId` is written from the server-side actor, never from request JSON.
4. The current create path should additionally validate dependency ownership and monitor-target SSRF safety before calling external URLs. See the audit section.

### Flow B: scheduled check in synchronous mode

```text
External scheduler
  → GET /api/cron?secret=...
  → timing-safe secret comparison + per-instance rate limit
  → query non-paused monitors
  → choose due monitors using interval, minimum interval, jitter and host cooldown
  → bounded-concurrency distributed checks
  → write Check + regional results (depending on write policy)
  → batch update Monitor.status and lastCheckAt
  → create/resolve incidents and send notifications
  → JSON summary to scheduler
```

The due calculation protects against too-aggressive configuration:

```text
effective interval = max(monitor interval, MONITOR_MIN_EFFECTIVE_INTERVAL_SECONDS)
due when elapsed >= effective interval + deterministic jitter
```

The documented monitor schema itself requires a minimum interval of 30 seconds. Jitter spreads checks out so many monitors do not hit the same host at the same instant.

### Flow C: queued pipeline

```text
Scheduler or /api/cron
  → add MonitorCheck job(s) to `monitor-checks`
  → probe worker runs distributed check (concurrency 4)
  → fan-out identical result to:
       `check-results-persistence`       `check-results-incident`
  → persistence worker (concurrency 10): Check + regions, current monitor projection
  → incident worker (concurrency 5): confirm failure, create/resolve incident
  → notification job to `notifications`
  → notification worker (concurrency 5): send email/webhooks
```

**Why fan out?** Storing evidence and deciding how to alert are separate responsibilities. A transient SMTP failure should not prevent a check being stored. It also allows each stage to have independent concurrency and retry rules.

**Important caveat:** the two result queues are filled concurrently. The incident worker reads recent `Check` rows to decide whether a failure threshold has been reached; the persistence worker may not have committed the new check yet. This is a real ordering race in the current code. The production design should make incident evaluation consume a persisted event/outbox record, or put persistence and threshold evaluation in one transactional sequence before emitting alert events.

### Flow D: a regional check and status classification

```text
For each configured logical region:
  if MONITOR_REGION_PROBE_ENDPOINTS[region] exists:
      POST { url, region } to edge probe with bearer token if configured
  else:
      make a local HTTP GET from the application worker
  retry a DOWN regional result up to configured retry count

Aggregate all regions:
  DOWN if downVotes >= ceil(regionCount × configured quorum ratio)
  DEGRADED if there is any DOWN or DEGRADED result but no DOWN quorum
  UP otherwise
```

With the default five labels and a quorum ratio of `0.6`, at least `ceil(5 × 0.6) = 3` regions must be DOWN before the aggregate status is DOWN. One or two failing regions result in DEGRADED rather than a full outage. This is an availability-versus-sensitivity choice:

- Higher quorum: fewer false positives but potentially slower/missed outage detection.
- Lower quorum: detects regional outages more aggressively but may page on probe/network failures.

#### HTTP interpretation

| Signal | Result | Rationale |
| --- | --- | --- |
| 2xx/3xx, ≤ 5s | UP | Endpoint is reachable and responds within threshold. |
| 2xx/3xx, > 5s | DEGRADED | Available but slow. |
| Most 4xx | DEGRADED | The service is alive but request/route/access may be wrong. |
| 403 with WAF hints | UP | Synthetic traffic can be challenged while real service remains reachable. |
| Most 5xx | DOWN | Server-side failure normally indicates outage. |
| WAF-like 503/52x | DEGRADED | Avoid declaring origin failure from a likely edge challenge. |
| 429 | Configurable; default UP | Prevent alert storms against a deliberately rate-limited target. |
| timeout, DNS, TLS, connection failure | DOWN | The probe could not establish a healthy response. |

The probe follows up to five redirects manually to retain the initial redirect status and final URL. It uses `AbortController` for a 10-second request timeout. For site-root monitors only, an optional fallback can try `/health` and `/status` when the main page is DEGRADED; this is a pragmatic but opinionated disambiguation strategy.

### Flow E: incident and notification lifecycle

```text
Aggregate DOWN
  → query latest checks
  → require MONITOR_DOWN_ALERT_CONSECUTIVE_CHECKS consecutive DOWN checks (default 2)
  → walk failing monitor dependencies to find a root cause
  → create one open incident if none exists
  → send DOWN alert only from the root cause and only on threshold crossing

Aggregate UP
  → find open incidents for monitor
  → mark RESOLVED and append timeline entries
  → send a RECOVERY alert if an incident was resolved
```

This design combines two anti-noise techniques:

1. **Debouncing:** a single bad result does not create an incident.
2. **Dependency suppression:** if a downstream service fails because an upstream dependency is failing, alert on the upstream root cause instead of paging for every dependent service.

The current `findRootCause()` follows the first dependency whose status is DOWN or DEGRADED. It is a useful lightweight heuristic, not a full causal inference engine. A mature system would define a deterministic topology/order, distinguish partial degradation from root causes, and surface the suppression decision explicitly in the UI.

### Flow F: public status page

```text
Owner creates StatusPage with a unique slug and owned monitor IDs
  → GET /api/status-pages/public/:slug
  → confirm page exists and isPublic
  → load selected monitors and their most recent region results
  → load up to 10 recent selected-monitor incidents
  → browser renders operational / affected summary
```

The public route returns only the selected page's title, description, selected monitor data, regional result summaries, and incidents. It does not expose owner account data or unselected monitors.

---

## 9. Reliability, scale, and consistency discussion

### What the implementation already does well

- **Bounded concurrency:** local distributed checks use `MONITOR_MAX_CONCURRENT_CHECKS`; workers have explicit concurrency limits.
- **Timeouts and manual redirect limits:** protects workers from indefinitely slow or looping targets.
- **Retry only on regional DOWN:** avoids repeating healthy work while retrying possible transient failures.
- **Quorum plus consecutive failure threshold:** reduces alert noise significantly compared with a single probe/single sample.
- **Host cooldown after 429:** honours `Retry-After` (or a default) to avoid continuing to pressure a rate-limited host in the synchronous checker.
- **Notification retry configuration:** BullMQ notification jobs use three attempts with exponential backoff and retain bounded completed/failed histories.
- **Database transaction use:** persistence stores a `Check` with all `CheckRegionResult` records and updates monitor projection within a transaction; automatic incident creation checks for an existing open incident in a transaction.
- **Graceful worker shutdown:** workers close on SIGINT/SIGTERM.

### At-least-once delivery and idempotency

Queues retry jobs when a worker fails. That is usually the right reliability choice, but it means the same logical work can run more than once. A production-quality answer is:

> "I assume at-least-once execution and make every consumer idempotent. I include a stable check execution ID, enforce a unique database constraint on it, use upsert or conditional state transitions, and persist an outbox event in the same database transaction. A relay sends the outbox event to the queue. That eliminates duplicate incidents/alerts caused by replay or a crash between a write and an enqueue."

Current gaps are recorded in the audit section below. In particular, queue job IDs are timestamp-based and persistence has no idempotency key, so duplicate scheduled jobs can create duplicate checks.

### Write optimisation

When `MONITOR_WRITE_ONLY_ON_CHANGE=true`, the application can skip a new `Check` row for unchanged non-DOWN state and only update the monitor projection. This reduces write pressure but changes the meaning of the history: it becomes event/change-oriented rather than a regular sample series. That is a valid optimisation only if charts and uptime calculations are designed for the missing samples.

`FORCE_WRITE_INTERVAL` is defined in configuration but is not used by the current implementation. If the intended contract is "write every Nth unchanged sample," it needs code and tests before it can be described as a feature.

### Scale estimate to discuss

For `M` monitors, `R` regions, and average interval `I` seconds:

```text
checks per second ≈ M / I
outbound probe requests per second ≈ M × R / I
daily regional requests ≈ M × R × 86,400 / I
```

Example: 10,000 monitors, five regions, checked every 60 seconds is roughly 833 outbound probe requests/second and 72 million regional observations/day. At that size, the architecture needs per-host rate limits, a sharded scheduler, database retention/rollups, message-broker monitoring, and a stronger data store strategy for time-series data.

---

## 10. Security deep dive

### Authentication and session handling

- Credentials registration hashes passwords with bcrypt cost factor 12.
- Credentials login compares the provided password with the stored hash.
- Google OAuth is configured through NextAuth.
- Session strategy is JWT; callbacks copy the user ID into token/session.
- Middleware blocks `/dashboard/*` and non-public API paths, while individual API routes also validate the actor and ownership.

The double protection (middleware plus route-level check) is defense in depth. Middleware is convenient for broad gating, but routes must remain authoritative because they are the actual resource boundary.

### Outbound request safety (SSRF)

An uptime monitor is an **outbound-request feature**, which makes SSRF one of the most important threats. An attacker could otherwise use the service to request private cloud metadata, loopback services, Redis/admin panels, or internal APIs.

`lib/ssrf.ts` attempts to block:

- non-HTTP(S) schemes;
- common IPv4 private, loopback, link-local, and unspecified ranges;
- selected IPv6 loopback, link-local, and unique-local addresses.

It is currently applied to webhook delivery and `pingUrl()`. The primary monitor path uses `runDistributedCheck()` / `probeUrlOnce()` directly, so **monitor targets are not consistently protected by that helper**. The Cloudflare probe currently checks only whether a target has an HTTP(S) URL. This should be treated as a high-priority issue before exposing arbitrary user-created monitors.

The production solution is stronger than a one-time DNS lookup:

1. Validate syntax and only allow `http`/`https`.
2. Resolve all A/AAAA records and deny all private, loopback, link-local, multicast, reserved, and provider-metadata ranges.
3. Revalidate on each redirect; never allow redirecting from a public URL to an internal IP.
4. Protect against DNS rebinding by connecting to a validated resolved address or using a hardened egress proxy.
5. Enforce outbound firewall/egress policy at the network layer; application validation is not sufficient on its own.
6. Cap response size and avoid forwarding target response bodies to users.

### Other protections and gaps

| Area | Current approach | Improvement to discuss |
| --- | --- | --- |
| Tenant isolation | Most resource queries include owner check | Also validate dependency ownership; avoid cross-tenant relations. |
| Cron secret | Timing-safe comparison if `CRON_SECRET` is set | Fail closed in production when missing; do not return diagnostic IP data to callers. |
| Request rate limits | Small in-memory map keyed by forwarded IP | Use Redis/upstream rate limiting; trust proxy headers only behind a known proxy; add account-based limits. |
| Password security | bcrypt 12, six-character minimum | Stronger policy/passkeys, verified email, reset flow, login rate limits, breach checks. |
| OAuth | NextAuth Google provider | Configure strict redirect origins, rotate secrets, test account-linking policy. |
| Notification webhooks | SSRF helper, 10-second timeout | Require exact URL validation at creation, HMAC signing, per-destination retries and delivery logs. |
| HTML email | Interpolates monitor name and URL into HTML | HTML-escape untrusted values before rendering. |
| Observability data | Cron logs request headers and fetches its runner public IP | Minimise sensitive logging and remove an unnecessary external request from hot cron path. |

---

## 11. Deployment and operations

### Required infrastructure

```text
Application host              Next.js app and, if queue mode is enabled, worker process(es)
PostgreSQL                    Neon-compatible Postgres database
Redis                         Required for BullMQ queue mode
External scheduler            Vercel Cron / GitHub Actions / cron-job.org / platform scheduler
SMTP provider                 Optional for email alerts
Cloudflare Workers            Optional for remote probe endpoint contract
```

### Important environment groups

| Group | Examples | Purpose |
| --- | --- | --- |
| Database | `DATABASE_URL` | Prisma/Neon database access. |
| Auth | `AUTH_SECRET`, `AUTH_URL`, Google credentials | Session signing and OAuth. |
| Scheduling | `CRON_SECRET`, minimum interval, max concurrency, jitter | Safe recurring execution. |
| Queue | `QUEUE_ENABLED`, `REDIS_URL` | Select async pipeline and connect workers. |
| Probing | region list/endpoints/tokens, timeout, quorum, retry policy, 429 policy | Distributed check behaviour. |
| Notifications | SMTP values | Email transport. |
| Data writes | `MONITOR_WRITE_ONLY_ON_CHANGE`, update batch size | Cost/performance tuning. |

### Recommended deployment topology

```text
Internet
  → CDN / WAF
  → Next.js web service (stateless replicas)
  → managed Postgres

One elected scheduler / managed recurring job
  → BullMQ enqueue
  → Redis
  → independently scalable worker deployment(s)
      probe workers
      persistence/incident workers
      notification workers
```

Use one scheduler leader. Multiple web instances are fine, but scheduler leader election or a database/Redis lock is needed if every instance may execute the scheduling loop.

### Operational signals to add

Liveness alone (`/api/health` returns `{ status: "alive" }`) is not enough. Add metrics and alert on:

- queue depth, age of oldest job, retry/failure count, and dead-letter count;
- schedule lag: `now - lastCheckAt - intendedInterval`;
- check duration, HTTP status distribution, regional failure rate, and timeout/DNS/TLS error counts;
- incident creation and resolution rates; notification delivery failure rate;
- Postgres connection/query latency and Prisma errors;
- Redis availability and memory;
- public-status-page response latency/error rate.

Tracing should carry a `checkExecutionId` from scheduler → job → probe → persistence → incident → notification. That lets an operator answer "why was this alert sent?" from one correlation ID.

---

## 12. Candid codebase audit: implemented gaps and priorities

This section is intentionally interview-friendly. A strong candidate can describe shortcomings, explain impact, and propose a measured fix.

| Priority | Finding | Evidence in current design | Impact | Practical fix |
| --- | --- | --- | --- | --- |
| **P0** | Monitor probes are not consistently SSRF-protected | `pingUrl()` checks `isSSRFSafeUrl`, but production monitor paths use `runDistributedCheck()` and the edge worker only performs an HTTP(S) syntax check | An authenticated user may cause probes to reach internal/private resources | Centralise hardened URL validation before any monitor is stored or probed; validate redirects; add egress firewall/proxy rules. |
| **P1** | Persistence and incident evaluation race in queue mode | Probe worker publishes to persistence and incident queues concurrently; incident worker queries `Check` history | Consecutive-failure evaluation can run before newest check is committed, delaying/misclassifying incident decisions | Persist check and threshold decision atomically, then emit an outbox event; or chain incident work after persistence acknowledgement. |
| **P1** | No durable idempotency for check results | Timestamp-based job IDs; no execution ID or unique DB constraint on checks | Duplicate cron/queue delivery can create duplicate checks/incidents or alerts | Use a stable execution ID, database uniqueness, conditional state transitions, and an outbox. |
| **P1** | Scheduler duplication is possible | External cron is documented; `workers/scheduler.ts` loops every 30 seconds; no lock prevents both paths | Duplicate traffic, duplicate history, higher cost | Choose one scheduler or use leader election/distributed lock plus a due-claim transaction. |
| **P1** | Rate limiting is process-local | `lib/rate-limit.ts` uses an in-memory `Map` and forwarded headers | Limits are bypassable across replicas/cold starts and proxy-header trust requires care | Move rate limits to Redis, CDN/WAF, or an API gateway; key by authenticated account where suitable. |
| **P1** | Dependency ownership is not validated | Monitor create/update connects arbitrary `dependencyIds`; cycle check only runs on update | A user may connect another tenant's monitor if its ID is obtained; topology and suppression can cross tenants | Verify every dependency belongs to `actor.userId`; prevent self-reference and enforce cycles on every change. |
| **P2** | Notification channel test is not limited to selected channel | Test endpoint loads one channel but calls `sendNotifications(userId)`, which sends to every enabled channel | Clicking "test this channel" may notify unrelated channels | Call direct delivery for that one channel or enqueue a destination-specific test job. |
| **P2** | Public status index uses an authenticated management endpoint | `/status` fetches `/api/status-pages`, which requires auth | Logged-out visitors see no list even when public pages exist | Add a dedicated public listing endpoint or remove the public index and use direct shared slug links. |
| **P2** | Manual incident state changes lack timeline entries | Incident PATCH updates fields but does not create `IncidentUpdate` | Incident history is incomplete | Append an update in the same transaction for every state/summary change. |
| **P2** | Status-page monitor selection is denormalised | `monitorIds String[]` | Harder relational queries and no display ordering/integrity | Introduce `StatusPageMonitor` join table. |
| **P2** | Write-on-change changes data semantics | Unchanged healthy checks may not be stored; `FORCE_WRITE_INTERVAL` is unused | Gaps can distort charts, uptime and alert reasoning | Decide whether history is sampling or events; implement rollups/heartbeat sampling with tests. |
| **P2** | Cron diagnostics expose/log unnecessary network metadata | Cron logs headers and returns runner IP/diagnostics | Privacy/noise and added dependency on `ifconfig.me` | Return minimal scheduler response; structured redacted logs and server-side diagnostics only. |
| **P3** | Role enum is unused | `Role` exists but routes do not check it | Future admin functionality has no enforcement | Add explicit authorisation policies when roles are introduced. |
| **P3** | Docs drift exists | README mentions demo-cleanup variables, while code does not contain demo cleanup | Operators may configure features that do not run | Treat docs/config as tested product surface; remove obsolete variables or implement feature. |

### How to present this in an interview

Do not say "the project has security issues" and stop there. Say:

> "I found the primary monitor probe path bypasses the existing SSRF helper, so I would make that the first release blocker. I would centralise target validation, validate every redirect, and enforce egress restrictions outside the process. Next I would eliminate the queue fan-out race by persisting the observation and an outbox event atomically. That is a targeted hardening plan: protect the network boundary first, then make the event lifecycle correct under retries."

That demonstrates judgement, prioritisation, and ownership.

---

## 13. Test strategy that should exist

There is no visible automated test suite in the repository. For an uptime monitor, prioritise these tests:

### Unit tests

- HTTP status classification: 2xx, 3xx, 4xx, 403+WAF hints, 429 policies, 5xx, slow success.
- Retry-after parsing: seconds, date format, invalid values.
- Quorum calculations for 1, 2, 3, and 5 regions and several ratios.
- Consecutive-DOWN state transitions and recovery behaviour.
- Dependency graph cycle/root-cause selection.
- SSRF denial for IPv4, IPv6, alternative encodings, DNS rebinding, and redirects.
- Zod schemas and URL normalisation.

### Integration tests

- Authenticated user cannot fetch, edit, delete, or attach another user's monitor.
- Queue pipeline persists exactly one check for a stable execution ID even after retry.
- Failed persistence cannot trigger false incident evaluation.
- Notification test reaches only the selected channel.
- Public page rejects private/missing slugs and returns only selected monitors.
- Cron rejects missing/incorrect secret in production configuration.

### End-to-end tests

- User registration/login → monitor creation → visible initial status.
- Controlled target returns 500 twice → incident opens and alert job is created.
- Target recovers → incident resolves and recovery notification is created once.
- A multi-region fixture produces one bad region → DEGRADED; enough bad regions → DOWN.

### Load and failure tests

- Burst of many due monitors; check bounded concurrency and queue latency.
- Redis restart, worker crash after DB commit, SMTP timeout, edge probe timeout.
- Slow/large target responses and host rate limiting.
- Database outage and reconnect/retry behaviour.

---

## 14. Interview question bank: Watchtower-specific

The answers below are deliberately short enough to speak, not memorise word-for-word.

### Product and architecture

1. **What problem does Watchtower solve?**

   It turns availability checking into a customer and operator workflow: detect an unhealthy endpoint, keep evidence, reduce false positives, create an incident, alert the owner, and publish a curated status view.

2. **Walk me through a check end to end.**

   A scheduler finds due non-paused monitors. In queue mode it puts a check job on BullMQ; the probe worker calls configured edge probes or a local fallback, aggregates the results using a quorum, and fans the result out to persistence and incident evaluation. Persistence updates historical and current state; incident logic opens/resolves incidents; notifications are separate jobs.

3. **Why do you need both a web app and workers?**

   Web requests should be fast and predictable. Probing unknown remote sites, retrying notifications, and processing scheduled work are slow and variable. Workers isolate that workload and let us control concurrency independently.

4. **Why is the dashboard not directly polling every target?**

   Browser checks would be subject to CORS, user-network variability, exposure of probe logic, and unreliable browser lifetime. The server-side/edge probe layer produces controlled, auditable measurements.

5. **How is multi-tenancy implemented?**

   The authenticated server session defines `userId`. Data creation writes that ID on the server, and reads/mutations constrain queries by the same owner ID. IDs alone are never treated as permission.

6. **What is the difference between a monitor, a check, and an incident?**

   A monitor is configuration plus current projection; a check is a historical observation; an incident is the operational record created after policy decides failures are meaningful.

### Monitoring decisions

7. **Why not call a monitor DOWN after one failed request?**

   Single failures can be packet loss, probe trouble, DNS propagation, or a transient deploy. Watchtower requires both a regional DOWN quorum and consecutive failed aggregate checks by default.

8. **Explain the quorum formula.**

   It computes `ceil(numberOfRegions × downQuorumRatio)`. With five regions and 0.6, three must be down. Anything less is DEGRADED if there is a bad result, so the UI still shows partial impact without declaring total outage.

9. **Why treat some 4xx responses as DEGRADED rather than DOWN?**

   A 4xx demonstrates the host responded; that may be a bad route or probe credentials, but it is not necessarily infrastructure unavailability. The policy is a product choice and should be configurable per monitor in a mature version.

10. **Why treat WAF-looking 403 responses as UP?**

   Bot protection can block synthetic probes while real users are served. The code looks for headers associated with common WAFs to avoid false paging, though this must be monitored because it can hide real access problems.

11. **What happens on 429?**

   The code parses `Retry-After`, classifies it according to a configurable policy (UP by default), and the synchronous checker applies a host cooldown. The policy avoids turning a target's deliberate rate limit into an alert storm.

12. **How are redirects handled?**

   Fetch uses manual redirects, follows up to five, and stores both the first redirect status and final URL. Manual handling gives us metadata and a place to apply redirect safety validation.

13. **What is the benefit of dependency-aware suppression?**

   If API depends on database and both fail, notifying for both creates noise. Walking failing dependencies allows alerting the likely upstream root cause and treating downstream incidents as suppressed symptoms.

14. **What are the limitations of the root-cause algorithm?**

   It follows the first failing dependency, so order can affect the result and it does not prove causality. A more complete approach models topology explicitly, handles multiple roots, and records deterministic suppression decisions.

### Data and queues

15. **Why use a relational database for monitoring data?**

   Ownership, incidents, timelines, and status pages are relational and benefit from transactions. The `(monitorId, createdAt)` index supports the primary history query. At high volume I would introduce retention and rollups or a dedicated time-series store.

16. **What delivery guarantee does BullMQ give you?**

   Design for at-least-once delivery. A job can be retried after a worker failure, so consumers must be idempotent. Exactly-once is achieved at the business level with unique keys and transactional outbox patterns, not by claiming the queue is magic.

17. **What bug/risk did you notice in the queue flow?**

   Persistence and incident evaluation are queued at the same time, but incident evaluation reads the persisted check history. It can run before the persistence commit. I would make persistence and state evaluation atomic, then publish an outbox event for notifications.

18. **Why have `Monitor.status` if you can query the latest check?**

   It is a denormalised current-state projection for cheap dashboard/status-page reads. The cost is maintaining it consistently with the event history, so it requires transaction and retry design.

19. **How would you prevent duplicate alerts?**

   Use a unique incident/open-state constraint or conditional update, stable check execution IDs, and an alert event keyed by incident transition plus channel. The retry handler then sees it was already delivered or scheduled.

20. **How would you scale from 100 to 100,000 monitors?**

   Separate scheduling from web, shard or partition the due-monitor scan, use distributed locks/leases, enforce per-host budgets, autoscale probe workers on queue depth, use a durable idempotent event design, and roll up/expire raw check data.

### Security and operations

21. **What is SSRF and why is this app exposed to it?**

   SSRF occurs when an attacker makes the server fetch an attacker-chosen URL, potentially reaching private networks or metadata endpoints. Monitoring deliberately fetches user-provided URLs, so it needs strict target validation, redirect checks, and egress network policy.

22. **What would you fix first before production?**

   Close the monitor-target SSRF gap, then fix the queue ordering/idempotency model. Those protect the network boundary and correctness of alerting—the two highest-risk areas.

23. **Why is an in-memory rate limiter insufficient?**

   Each application instance has its own memory; requests can be spread across instances or lost on restart. It is okay as a local guardrail but not a distributed security control.

24. **What does a good health check include?**

   Liveness says process is running. Readiness should verify critical dependencies or their recent status, such as database and Redis connectivity. Queue lag and last successful scheduler run should be monitored separately rather than hidden in a liveness endpoint.

25. **What observability would you add?**

   Structured logs with check IDs, metrics for queue lag/check duration/error reasons/alert success, and distributed tracing across every worker stage. The key operational question is: which check resulted in which incident and which notification?

---

## 15. Broader technology questions that may be asked anyway

These may not be implemented fully in Watchtower, but they commonly appear when the stack is on a résumé.

### Next.js and React

1. **Server Components vs Client Components?**

   Server Components run on the server and can access server-only data without adding their code to the browser bundle. Client Components are needed for hooks, state, effects, and browser interaction. Use the smallest client boundary possible.

2. **What is a Next.js Route Handler?**

   A file-based HTTP handler under `app/api/.../route.ts` that exports methods such as `GET` or `POST`. It is useful for lightweight application APIs but should not be treated as a long-running worker runtime.

3. **What caching issue matters in an uptime dashboard?**

   Status must be fresh, so avoid accidentally serving stale cached responses for live data. At the same time, cache public/static shells and aggregate data where acceptable. Define freshness explicitly for each screen.

4. **Why not put database calls in a client component?**

   It would expose credentials/implementation, create insecure data access, and add unnecessary network round trips. Use server components, route handlers, or server actions with authorisation.

### TypeScript and validation

5. **Why are TypeScript types not enough for API input?**

   A type only helps the code author at compile time. An HTTP client can still send any JSON at runtime. Zod checks runtime values and converts validation failure into a controlled response.

6. **What is the value of discriminated unions for check results?**

   They make invalid states harder to represent, for example requiring error fields for a failure result. They improve exhaustive handling in workers and UI when statuses grow.

### PostgreSQL, Prisma, and Neon

7. **What does an index on `(monitorId, createdAt)` optimise?**

   Queries that filter a monitor and order/range by time, such as drawing a monitor's 24-hour chart. Column order matters: it is less useful for a query that only filters `createdAt` across all monitors.

8. **When should you use a transaction?**

   When several writes must succeed or fail as one logical state change: create a check and regional results, update the current monitor projection, and possibly persist an outbox event. Do not hold a database transaction open while doing network calls.

9. **What is the N+1 problem?**

   Fetching a list and then issuing one query per list item for related data. It adds latency and database load. Use joins/includes, batching, or a purpose-built aggregate query while limiting the selected columns.

10. **Why does serverless Postgres connection management matter?**

   Many ephemeral web invocations can open too many connections. A serverless-compatible driver/adapter and a managed pooling strategy avoid connection exhaustion; reusing a Prisma client locally also prevents hot-reload connection churn.

### Redis, queues, and distributed systems

11. **What is backpressure?**

   It is the mechanism that prevents producers from overwhelming consumers or downstream systems. Queue depth, worker concurrency, per-host limits, and admission control provide backpressure in Watchtower.

12. **At-most-once, at-least-once, exactly-once?**

   At-most-once can lose work but never retries. At-least-once retries but can duplicate work. Exactly-once end-to-end is usually approximated with idempotent writes and deduplicated state transitions.

13. **What is a dead-letter queue?**

   A place for jobs that have exhausted retries, so they can be inspected/replayed without silently disappearing. BullMQ retains failed jobs, but a clear operational DLQ policy and alerting should be added.

14. **Why use exponential backoff?**

   It gives a flaky downstream dependency time to recover and reduces retry storms. Add jitter so many workers do not retry at exactly the same time.

15. **What is leader election?**

   Ensuring only one scheduler instance performs a singleton task. It can use a lease in Postgres/Redis with a heartbeat/expiry; code must handle a leader dying mid-task.

### HTTP and networking

16. **Why have request timeouts if TCP already handles failure?**

   Network stacks can wait much longer than product latency tolerance. Application timeouts bound resource use and make failure behaviour predictable.

17. **What is the difference between connect timeout and response timeout?**

   Connect timeout limits time to establish a connection; response/read timeout limits waiting for data after connecting. A robust monitor records which stage failed because it changes diagnosis.

18. **Why is following redirects a security risk?**

   A public URL can redirect to a private IP or a different scheme. Every hop must be validated and bounded, not just the initial URL.

19. **What is DNS rebinding?**

   A hostname initially resolves to a public address during validation and later resolves to a private address when fetched. It is why an allow/deny check based only on one DNS lookup is not sufficient.

20. **What is idempotency for an HTTP API?**

   Repeating the same request has the same intended effect. GET/PUT/DELETE are conventionally idempotent; POST can be made idempotent with an idempotency key, which is valuable for monitor creation and manual checks.

### Security, DevOps, and observability

21. **Authentication vs authorisation?**

   Authentication establishes who someone is. Authorisation decides whether that identity may perform an action on a resource. A valid JWT does not itself authorise a user to edit any monitor ID.

22. **What is the principle of least privilege?**

   Every identity and component gets only permissions it needs. For this project: separate DB credentials where possible, worker-only queue access, narrow outbound network policy, and no secrets in browser code.

23. **What is a transactional outbox?**

   Write the business change and an event record in the same database transaction. A relay publishes unsent events to the queue. It avoids the dual-write problem where DB success and queue publish do not agree after a crash.

24. **Logs vs metrics vs traces?**

   Logs explain individual events, metrics show numeric trends and alert conditions, and traces connect one request/job through multiple services. A queue pipeline benefits from all three.

25. **What is an SLI, SLO, and SLA?**

   An SLI is a measured indicator such as successful checks. An SLO is a target such as 99.9% availability over 30 days. An SLA is a contractual commitment, often with consequences. The monitor's own health should be measured separately from the target's health.

26. **Blue/green vs canary deployment?**

   Blue/green switches traffic between two complete environments. Canary gradually exposes a new version to a small percentage while observing metrics. Worker schema/job changes require backward-compatible messages during either strategy.

27. **Why version queue payloads?**

   Producers and consumers may deploy at different times. Including a version and maintaining backward compatibility prevents a new producer from breaking an old worker or vice versa.

---

## 16. A strong "what would you improve next?" roadmap

### First release blocker: security and correctness

1. Centralise SSRF-safe monitor target validation; validate redirects and enforce egress policy.
2. Enforce dependency ownership and no self/cross-tenant links.
3. Replace persistence/incident queue fan-out with atomic persistence + transactional outbox.
4. Add a stable check execution ID, unique constraint, idempotent consumers, and per-transition alert deduplication.
5. Fail closed when production secrets are missing; remove diagnostic response leakage.

### Next: operability and quality

1. Use Redis/API-gateway rate limits and per-host probe budgets.
2. Add unit, integration, E2E, failure, and load tests described above.
3. Add OpenTelemetry-compatible tracing, structured logs, metrics, and queue-lag alerts.
4. Implement a public status-page listing endpoint or remove the misleading index.
5. Fix notification-channel test behaviour and append manual incident timeline events.

### Then: product and scale

1. Normalize status-page membership; support service groups, ordering, and maintenance windows.
2. Retain raw data for a bounded period and calculate time-bucketed aggregates/uptime rollups.
3. Add SSL expiry, keyword assertions, TCP/DNS monitors, browser synthetic checks, and per-monitor policies.
4. Add organisations, teams, RBAC, audit logs, on-call schedules, and notification integrations.
5. Use scheduler leasing/sharding and independently autoscaled workers as monitor count grows.

---

## 17. Final presentation checklist

Before an interview or live demo:

- Be able to draw the three main paths: dashboard/API, check pipeline, public status page.
- Know the definitions of monitor, check, regional result, incident, and notification channel.
- Explain the two false-positive controls: quorum and consecutive DOWN checks.
- Explain why queue workers are separate from Next.js request handling.
- State the at-least-once/idempotency limitation honestly and describe the outbox fix.
- Lead with SSRF as the main security threat in monitoring products and explain layered mitigation.
- Never claim configured Cloudflare Worker labels are guaranteed physical regions without verifying deployment/routing behaviour.
- Never claim the system is "fully production-ready"; say what would make it production-ready.
- In a design interview, choose explicit numbers: timeouts, concurrency, quorum, retention, alert threshold, and explain their trade-offs.

### Good closing answer

"The interesting part of Watchtower is not the dashboard; it is turning unreliable, user-defined network observations into trustworthy operational signals. I designed the current version around validation, bounded work, quorum-based classification, incident state, and asynchronous delivery. The next hardening step is making every boundary explicit: hardened egress for SSRF, durable idempotent events for queues, and observability for the whole pipeline."

