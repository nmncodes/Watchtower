# Watchtower Mock Interview Q&A

Use these as speaking answers, not scripts to memorise. Replace “I” with your own actual contribution where necessary.
<!-- minor update -->

---

## Project overview

### 1. Tell me about this project.

**Answer:**

Watchtower is an uptime monitoring and incident-management application. A user creates HTTP(S) monitors for websites or APIs. The system schedules checks, probes the target, classifies the result as UP, DEGRADED, or DOWN, records the result in PostgreSQL, creates or resolves incidents, and sends alerts through email or webhooks. Users can also publish selected monitors on a public status page. The interesting part is converting unreliable network observations into a useful operational signal while avoiding false alerts.

### 2. What real problem does Watchtower solve?

**Answer:**

It answers three operational questions: “Is my service reachable?”, “When did it become unhealthy and how severe is it?”, and “How do I notify the right people and communicate status externally?” A simple HTTP request is not sufficient because a single failure may be transient. Watchtower adds scheduling, history, regional quorum, incident policy, and notifications around that request.

### 3. What is the architecture?

**Answer:**

The web application is built in Next.js with App Router. It has protected dashboard routes and API route handlers. Prisma connects the application to Neon PostgreSQL. When queue mode is enabled, Redis and BullMQ separate scheduling, probing, persistence, incident processing, and notifications into workers. Optional Cloudflare Workers execute probe requests through a small HTTP contract. This keeps UI request handling separate from slow network work.

### 4. Explain the end-to-end flow after a user creates a monitor.

**Answer:**

The API first validates the request with Zod and identifies the authenticated user through NextAuth. It writes the monitor with the server-derived user ID, so the client cannot choose an owner. It then attempts an initial check. Later, a scheduler finds non-paused monitors that are due. In queue mode it enqueues a check job; a probe worker performs regional probes, persistence stores aggregate and regional results, incident processing decides whether to open or resolve an incident, and notification work sends alerts.

### 5. Why did you use a queue instead of doing everything in the cron request?

**Answer:**

Checking external URLs and sending notifications are slow, unpredictable operations. If I perform them all inside a web/cron request, the request can time out and a traffic spike can overload the application. BullMQ gives a durable work buffer, bounded concurrency, retry handling, and independent worker scaling. The request can enqueue work and return quickly.

---

## Next.js, React, and TypeScript

### 6. Why did you choose Next.js?

**Answer:**

Next.js lets me build the React dashboard, server-rendered pages, and typed API route handlers in one codebase. App Router gives a clean route structure and server/client component separation. It is a productive choice for the product UI and management APIs. I still keep background monitoring work in workers because a web framework is not a substitute for durable asynchronous processing.

### 7. What are Server Components and Client Components?

**Answer:**

Server Components execute on the server and are good for data access and rendering without sending that component’s JavaScript to the browser. Client Components are needed for browser interaction such as state, event handlers, `useEffect`, and dialogs. I keep client boundaries as small as possible so the dashboard remains interactive without unnecessarily increasing the browser bundle.

### 8. What is a Next.js Route Handler?

**Answer:**

A Route Handler is a server-side function in `app/api/.../route.ts` that exports HTTP methods such as `GET`, `POST`, or `PATCH`. In Watchtower, route handlers validate requests, check the authenticated actor, apply ownership rules, call Prisma, and return JSON. They are suitable for request-response APIs, while long-running probes are moved to workers.

### 9. Why use TypeScript if you still use Zod?

**Answer:**

TypeScript checks the code I write at compile time, but it cannot validate arbitrary JSON sent by a browser or third-party client at runtime. Zod validates that external input actually has the expected shape and range. Prisma types the database layer, TypeScript connects the layers safely, and Zod protects the runtime boundary.

### 10. How do you avoid stale status data in Next.js?

**Answer:**

Live operational data needs explicit freshness rules. I avoid treating monitor status as static content, and the cron route is marked dynamic. For a production version, I would define freshness per view: cache the visual shell aggressively, but fetch current monitor status with a short revalidation or polling interval. I would also show the last-check timestamp so a user can distinguish an UP state from an old state.

---

## Authentication and multi-tenancy

### 11. How does authentication work?

**Answer:**

Watchtower uses NextAuth v5 with both Google OAuth and credentials login. Credentials passwords are hashed using bcrypt with cost 12. The session strategy is JWT, and callbacks put the user ID onto the session. Routes use a helper that confirms both the session and that the user still exists in the current database.

### 12. How do you prevent one user from accessing another user's monitor?

**Answer:**

Every tenant-owned resource query constrains the resource to the authenticated actor. For example, rather than querying only by monitor ID, the API uses a condition equivalent to `where: { id, userId: actor.userId }`. That prevents insecure direct object reference even if someone obtains another monitor’s ID. Opaque IDs improve guess resistance, but they are never a replacement for authorisation.

### 13. What is the difference between authentication and authorisation?

**Answer:**

Authentication establishes who the user is. Authorisation determines whether that authenticated user may perform a specific action on a specific resource. A valid session proves a user is signed in; the owner check proves they may edit that particular monitor.

### 14. What would you add to strengthen auth?

**Answer:**

I would add distributed login rate limiting, email verification, password reset, a stronger password/passkey strategy, session and secret rotation, and explicit RBAC only when the product has roles that need enforcement. The schema already has a role field, but the current routes do not use it, so I would not claim role-based access control is complete.

---

## Database and Prisma

### 15. Why use PostgreSQL?

**Answer:**

The core domain is relational: users own monitors, monitors have checks and incidents, and incidents have timeline updates. PostgreSQL provides referential integrity, transactions, rich queries, and indexes. It is a strong default for the product data. At very high probe volume, I would retain/roll up check data or add a time-series-oriented store, but Postgres is the right starting point.

### 16. Explain the main database entities.

**Answer:**

A `Monitor` is the configuration and current status. A `Check` is one historical aggregate observation. Each `Check` has `CheckRegionResult` children with evidence from each probe. An `Incident` represents an operational issue and has timeline updates. `NotificationChannel` is an email or webhook destination. `StatusPage` selects which monitors are visible publicly.

### 17. Why store `Monitor.status` when checks already contain status?

**Answer:**

`Monitor.status` is a denormalised current-state projection. It makes dashboard and public-status reads fast because they do not need a “latest check per monitor” query each time. The trade-off is consistency: updates to the history and projection need to be designed transactionally and idempotently.

### 18. What does the `(monitorId, createdAt)` index help with?

**Answer:**

It supports the common query pattern “fetch a particular monitor’s checks over a time range, ordered by creation time.” That is exactly what the charts and monitor details need. Index order is intentional: it is most useful when `monitorId` is known first.

### 19. When do you use a database transaction?

**Answer:**

I use it when several writes form one business state change. For example, creating a check and all of its regional results should be atomic, and updating the current monitor projection should be consistent with that stored observation. I would not keep a transaction open while performing network calls because that causes lock contention and long-lived connections.

### 20. What is the N+1 query problem?

**Answer:**

It happens when an application loads a list and then does one extra query for each row’s related data. For 100 monitors that can become 101 queries. Prisma `include`/`select`, batching, or aggregate queries avoid it. Watchtower fetches related check/region data deliberately with limits for the detail views.

---

## Monitoring logic and networking

### 21. How do you decide whether a site is UP, DEGRADED, or DOWN?

**Answer:**

For a regional probe, successful responses below the slow threshold are UP; slow successes and most 4xx responses are DEGRADED; most 5xx responses and network failures are DOWN. The regional results are then aggregated. A monitor becomes DOWN only if enough regions fail to meet the quorum; otherwise any unhealthy regional result produces DEGRADED. The policy is designed to distinguish a complete outage from partial impact.

### 22. What is a quorum, and why use it?

**Answer:**

A quorum is the minimum number of votes required for a decision. Watchtower uses `ceil(totalRegions × quorumRatio)`. With five regions and a ratio of 0.6, three regions must be DOWN for the monitor to be DOWN. This reduces false positives caused by one probe location or one transient network path failing.

### 23. Why do you require consecutive DOWN checks?

**Answer:**

It is debouncing. A one-off timeout can be a transient network error, DNS issue, or short deployment event. Requiring two consecutive aggregate DOWN checks before creating an incident makes alerts more trustworthy. The trade-off is slower detection, so the threshold and interval need to match the service’s operational requirements.

### 24. Why are some 4xx responses DEGRADED rather than DOWN?

**Answer:**

A 4xx generally proves that the server responded, so the infrastructure is reachable. It can still mean a broken route, authorization issue, or bad probe configuration, so it is not fully healthy. Treating it as DEGRADED preserves the signal without automatically declaring a total availability outage.

### 25. How do you handle a rate-limited target that returns 429?

**Answer:**

The probe parses `Retry-After`, and the status policy for 429 is configurable; the default is UP to avoid paging just because a target deliberately limits synthetic traffic. The synchronous checker also applies a host cooldown so it does not keep sending requests while the host is asking clients to wait.

### 26. How do redirects work?

**Answer:**

The code follows redirects manually, with a maximum of five hops. That allows it to preserve redirect metadata and inspect the final URL. In a hardened version, every redirect target must pass SSRF validation before it is fetched.

### 27. What does the fallback to `/health` or `/status` do?

**Answer:**

For a root URL that is DEGRADED, Watchtower can try common health endpoints and choose the preferred result. This can reduce false degradation when a marketing page behaves differently from the service health endpoint. It is intentionally optional because it changes what the monitor means; a production product should make the expected endpoint explicit per monitor.

### 28. What are the limitations of the regional implementation?

**Answer:**

If region endpoints are configured, the app calls them through a Cloudflare Worker probe contract. If not configured, it performs local fallback calls with different labels, which are not truly geographically independent. Also, labels on Cloudflare Worker environments alone should not be described as a guaranteed physical-region placement without verifying the provider’s routing model.

---

## Workers, Redis, and BullMQ

### 29. Describe the BullMQ pipeline.

**Answer:**

The scheduler or cron route creates monitor-check jobs. The probe worker executes the distributed check and sends the result to persistence and incident queues. The persistence worker stores the check and updates the monitor projection. The incident worker applies threshold and lifecycle logic, then creates notification jobs. The notification worker sends SMTP email or webhooks. Each worker has bounded concurrency so one slow stage does not consume unlimited resources.

### 30. What delivery guarantee do you assume from the queue?

**Answer:**

I assume at-least-once delivery. A job may run again after a crash or retry, so consumers need idempotency. I would use a stable execution ID, a unique database constraint, conditional transitions, and a transactional outbox. I would not claim end-to-end exactly-once delivery merely because BullMQ retries jobs.

### 31. What is the biggest consistency issue in the queue flow?

**Answer:**

The probe worker publishes a result to the persistence and incident queues in parallel. Incident processing queries recent persisted checks to decide whether the consecutive failure threshold is met. It can run before the persistence worker has committed the current check. I would fix that by persisting the observation and the event record atomically, then having an outbox relay trigger downstream incident and notification processing.

### 32. What is a transactional outbox pattern?

**Answer:**

When I commit a business update, I write an outbox event in the same database transaction. A separate relay reads unsent events and publishes them to the queue, marking them delivered safely. This avoids the dual-write failure where the database update succeeds but process crashes before queue publication, or where a message is published without the matching database state.

### 33. Why do workers need concurrency limits?

**Answer:**

Without limits, a large number of due monitors could open too many outbound connections, exhaust CPU/memory, overload Redis/Postgres, or hammer a target host. Concurrency is a backpressure control. In production I would also add per-host concurrency and token-bucket limits.

### 34. Why can the internal scheduler and external cron be a problem together?

**Answer:**

Both can discover the same due monitor before `lastCheckAt` is updated. With no distributed leader lock or due-claim lease, they can enqueue duplicate checks. I would choose one scheduler strategy or add leader election and idempotent execution IDs.

---

## Incidents and notifications

### 35. How are incidents created and resolved?

**Answer:**

After confirmed consecutive aggregate DOWN checks, the system looks for an existing unresolved incident. If none exists, it creates an INVESTIGATING incident with a timeline entry. When a subsequent aggregate result is UP, it finds unresolved incidents for that monitor, resolves them, appends a recovery entry, and triggers a recovery alert.

### 36. How do monitor dependencies reduce alert noise?

**Answer:**

Monitors can represent dependency relationships. When a monitor fails, the system walks dependencies looking for a failing upstream monitor. It alerts the root cause and suppresses downstream alerts. For example, if an API and its database are both down, the operator should receive one meaningful root-cause alert rather than a cascade of pages.

### 37. What are limitations of the dependency logic?

**Answer:**

It currently follows the first failing dependency, which is a heuristic rather than proof of cause. Ordering can affect the result, and DEGRADED dependencies can influence suppression. I would make the graph deterministic, enforce same-tenant dependency ownership, support multiple roots, and display suppressed relationships explicitly.

### 38. How do email and webhooks differ operationally?

**Answer:**

Email is a human-facing delivery channel with SMTP provider concerns. A webhook is machine-to-machine HTTP delivery, so it needs endpoint validation, signatures, retry policy, and delivery logs. Both should be decoupled from monitoring through queued jobs so a slow or failing destination does not block checks.

### 39. What is wrong with the current test-notification endpoint?

**Answer:**

It loads the selected notification channel, but then calls a helper that sends to all enabled channels for that user. A user testing one webhook could alert every destination. I would call direct delivery for only the selected channel, or enqueue a destination-specific test job.

---

## Security

### 40. What is SSRF, and why is Watchtower particularly exposed to it?

**Answer:**

SSRF, or server-side request forgery, is when an attacker makes the server request an attacker-controlled URL, possibly including internal services or cloud metadata endpoints. Watchtower intentionally fetches user-provided monitor URLs, so SSRF is a primary design threat rather than an edge case.

### 41. How would you defend against SSRF?

**Answer:**

I would use layered defence: permit only HTTP(S); resolve every hostname and reject private, loopback, link-local, reserved, multicast, and metadata ranges; revalidate every redirect; protect against DNS rebinding; cap response size; and enforce outbound firewall or egress-proxy rules. Application checks alone are not enough because DNS and network conditions can change.

### 42. What SSRF concern exists in the current code?

**Answer:**

There is an SSRF helper used for webhook URLs and one unused-style ping path, but the normal monitor flow uses `runDistributedCheck()` directly, while the edge worker checks only for HTTP(S) syntax. Therefore monitor targets are not consistently protected. I would address that before treating arbitrary user-created monitoring as production-ready.

### 43. Why is an in-memory rate limiter not enough?

**Answer:**

It works only within one process. Multiple server instances each have separate counters, cold starts erase the state, and forwarded client-IP headers need trusted proxy configuration. It is useful as a small local guardrail, but production rate limits belong in Redis, an API gateway, or a WAF.

### 44. How would you secure outbound webhooks?

**Answer:**

Validate and test the exact destination at creation, enforce SSRF/egress policy, sign payloads with an HMAC and timestamp, use HTTPS, set bounded retry/backoff behaviour, and record per-attempt delivery state. I would also avoid exposing secrets in payloads/logs and let users rotate a webhook signing secret.

---

## Scaling and operations

### 45. How would you scale to 100,000 monitors?

**Answer:**

I would make scheduling a leased/sharded responsibility instead of scanning from many app instances, partition monitors by shard or time bucket, use durable idempotent jobs, autoscale worker pools on queue lag, apply global and per-host rate limits, and store raw checks with a retention policy plus rollups. I would also quantify capacity: monitor count times regions divided by interval gives the steady outbound probe rate.

### 46. What metrics would you monitor for Watchtower itself?

**Answer:**

Queue depth and age, scheduler lag, probe duration and error type, check success rate by region, database latency/errors, worker restarts, notification delivery success, and last successful check per monitor. The service should alert if it is not monitoring, not only if monitored targets are unhealthy.

### 47. What is the difference between liveness and readiness?

**Answer:**

Liveness answers whether the process is alive; Watchtower’s current health endpoint is essentially liveness. Readiness answers whether it can do useful work, such as reaching Postgres and Redis. I would expose readiness carefully and separately, while monitoring queue lag and scheduler freshness as their own signals.

### 48. What tests would you add first?

**Answer:**

I would start with pure unit tests for status classification, quorum, retry-after parsing, failure thresholds, and SSRF. Then integration tests for tenant ownership, idempotent queue retries, persistence-before-incident ordering, and public status-page access. Finally I would run controlled end-to-end outage/recovery tests and load/failure tests with Redis, SMTP, and worker failures.

### 49. What is your first production-hardening priority and why?

**Answer:**

First I would close the SSRF gap because it protects the network boundary against a serious attack class. Second I would fix the persistence/incident ordering and idempotency model because correct alerting is the product’s core promise. After that I would add distributed rate limits, observability, and test coverage.

### 50. What did you learn from building this?

**Answer:**

The main lesson is that the hard part of monitoring is not sending a request; it is making the result trustworthy. That requires explicit policies for failures, retries, regions, state transitions, duplicate delivery, security boundaries, and observability. I also learned to be honest about operational gaps and to prioritise fixes by impact rather than treating every improvement as equally urgent.

---

## Rapid-fire questions

| Question | Strong short answer |
| --- | --- |
| Why bcrypt? | It is deliberately slow and salted, which makes password guessing more expensive than a fast hash. |
| Why not send email inside the API request? | Delivery is slow and unreliable; queue it so request latency and availability do not depend on SMTP. |
| What is backpressure? | A way to prevent producers from overwhelming consumers; queues, concurrency limits, and per-host limits provide it. |
| What is idempotency? | Repeating a logical operation produces the same business effect; essential under retries. |
| Why is `Retry-After` important? | It lets a client back off and avoids turning monitoring into pressure on a rate-limited target. |
| What is a DLQ? | A place to inspect jobs that exhausted retries, instead of silently losing them. |
| Why use a transaction? | To make related database writes commit or roll back as one business state change. |
| What is a race condition here? | Incident evaluation can happen before persistence because they consume separate queues in parallel. |
| Why validate server-side as well as client-side? | Clients are untrusted and can bypass browser validation. |
| What is a status projection? | A stored current view, such as `Monitor.status`, derived from historical events for faster reads. |
| What is an SLO? | A target for a service-level indicator, e.g. 99.9% availability over 30 days. |
| Why is a raw check retention policy needed? | High-frequency histories grow quickly; rollups preserve trends at lower cost. |

