# Watchtower

**Open-source uptime monitoring and incident management platform.** Track your website and API availability in real-time, get instant notifications when things go down, and share public status pages with your users.

Built with **Next.js 16**, **Prisma**, **Neon PostgreSQL**, and **shadcn/ui**.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Running Locally](#running-locally)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
  - [Authentication](#authentication-api)
  - [Monitors](#monitors-api)
  - [Incidents](#incidents-api)
  - [Status Pages](#status-pages-api)
  - [Notification Channels](#notification-channels-api)
  - [Cron](#cron-api)
- [Monitoring Engine](#monitoring-engine)
- [Notifications](#notifications)
- [Public Status Pages](#public-status-pages)
- [Dashboard](#dashboard)
- [Deployment](#deployment)
  - [Vercel](#deploy-to-vercel)
  - [Cron Configuration](#cron-configuration)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **HTTP Monitoring** — Ping any URL at configurable intervals (10s–3600s). Detects UP, DOWN, and DEGRADED states based on HTTP status codes and response times.
- **Response Time Charts** — Interactive area charts powered by Recharts with 24h / 7d / 30d time range filtering.
- **Uptime Percentage** — Per-monitor and aggregate uptime calculations with color-coded indicators.
- **Sparklines** — Inline mini-charts on the monitors list and dashboard overview for at-a-glance trends.
- **Uptime Bar** — Visual slot-based uptime history bar on each monitor detail page (similar to UptimeRobot/GitHub style).
- **Performance Stats** — Average, min, max, and P95 response time metrics per monitor.
- **Automatic Incident Management** — Incidents are auto-created when a monitor goes DOWN and auto-resolved when it recovers. Timeline entries are added for every status change.
- **Manual Incidents** — Create and manage incidents manually with status progression: Investigating → Identified → Monitoring → Resolved.
- **Notifications** — Email (SMTP) and Webhook notifications on status changes (DOWN / RECOVERY). Per-user notification channels with enable/disable toggle.
- **Public Status Pages** — Create branded, publicly accessible status pages with a custom slug. Shows real-time service status and recent incidents. No authentication required for viewers.
- **Authentication** — Credentials-based auth via NextAuth.js v5 with JWT sessions. Registration with bcrypt password hashing. Dashboard routes are protected via middleware.
- **Dark Mode** — Full light/dark theme support via `next-themes`.
- **Cron Endpoint** — `/api/cron` checks all due monitors. Can be triggered by Vercel Cron, GitHub Actions, or any external scheduler. Protected by a shared secret.
- **Multi-Region Support** — Configurable region labels per monitor (us-east-1, us-west-2, eu-west-1, ap-south-1).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, React 19) |
| **Database** | [Neon PostgreSQL](https://neon.tech/) (serverless) |
| **ORM** | [Prisma 7](https://www.prisma.io/) with `@prisma/adapter-neon` |
| **Auth** | [NextAuth.js v5](https://authjs.dev/) (Credentials provider, JWT) |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com/) (New York style) + [Radix UI](https://www.radix-ui.com/) |
| **Charts** | [Recharts 2](https://recharts.org/) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **Validation** | [Zod](https://zod.dev/) |
| **Forms** | [React Hook Form](https://react-hook-form.com/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Email** | [Nodemailer](https://nodemailer.com/) |
| **Notifications** | Toast via [Sonner](https://sonner.emilkowal.dev/) |
| **Analytics** | [Vercel Analytics](https://vercel.com/analytics) |
| **Language** | TypeScript 5.7 |
| **Package Manager** | pnpm |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App Router                        │
├─────────────┬─────────────┬──────────────┬──────────────────────┤
│  Landing    │  Auth Pages │  Dashboard   │  Public Status Page  │
│  (/)        │  (/auth/*)  │  (/dashboard)│  (/status/[slug])    │
├─────────────┴─────────────┴──────────────┴──────────────────────┤
│                         API Routes                               │
│  /api/auth/*  /api/monitors/*  /api/incidents/*  /api/cron      │
│  /api/status-pages/*  /api/notification-channels/*               │
├──────────────────────────────────────────────────────────────────┤
│                     Business Logic                               │
│  lib/monitor-checker.ts  lib/notifications.ts  lib/session.ts   │
├──────────────────────────────────────────────────────────────────┤
│  Prisma ORM  ─→  Neon PostgreSQL (serverless, @prisma/adapter-neon) │
└──────────────────────────────────────────────────────────────────┘
         ↑
   Vercel Cron / External Scheduler
   hits GET /api/cron?secret=<CRON_SECRET>
```

**Data Flow:**

```
Cron/Manual Trigger → pingUrl(url) → Record Check → Update Monitor Status
  → DOWN? → Create Incident + Send DOWN Notification
  → UP (was DOWN)? → Resolve Incident + Send RECOVERY Notification
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (Node 20+ recommended)
- **pnpm** (`npm install -g pnpm`)
- **PostgreSQL** database (recommended: [Neon](https://neon.tech/) free tier)
- **SMTP credentials** for email notifications (optional — Gmail, Resend, etc.)

### Installation

```bash
git clone https://github.com/your-username/watchtower.git
cd watchtower
pnpm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# ── Database ────────────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# ── Cron Secret ─────────────────────────────────────────────
# Protects the /api/cron endpoint. Set to any secure random string.
CRON_SECRET="your-random-secret"

# ── NextAuth ────────────────────────────────────────────────
AUTH_SECRET="generate-with-openssl-rand-base64-32"
AUTH_URL="http://localhost:3000"

# ── SMTP (for email notifications) ─────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

> **Tip:** Generate `AUTH_SECRET` with `openssl rand -base64 32`.

### Database Setup

```bash
# Generate the Prisma client
pnpm prisma generate

# Push schema to database (or run migrations)
pnpm prisma db push

# (Alternative) Run migrations
pnpm prisma migrate deploy
```

### Running Locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Register a new account to get started.

---

## Project Structure

```
watchtower/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── layout.tsx                  # Root layout (providers, fonts, analytics)
│   ├── globals.css                 # Global styles
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/      # NextAuth route handler
│   │   │   └── register/route.ts   # POST /api/auth/register
│   │   ├── cron/route.ts           # GET /api/cron — monitor checker
│   │   ├── monitors/
│   │   │   ├── route.ts            # GET/POST /api/monitors
│   │   │   └── [id]/
│   │   │       ├── route.ts        # GET/PATCH/DELETE /api/monitors/:id
│   │   │       └── check/route.ts  # POST /api/monitors/:id/check
│   │   ├── incidents/
│   │   │   ├── route.ts            # GET/POST /api/incidents
│   │   │   └── [id]/route.ts       # GET/PATCH/DELETE /api/incidents/:id
│   │   ├── status-pages/
│   │   │   ├── route.ts            # GET/POST /api/status-pages
│   │   │   ├── [id]/route.ts       # GET/PATCH/DELETE /api/status-pages/:id
│   │   │   └── public/[slug]/route.ts  # GET public status page data
│   │   └── notification-channels/
│   │       ├── route.ts            # GET/POST /api/notification-channels
│   │       └── [id]/route.ts       # PATCH/DELETE /api/notification-channels/:id
│   ├── auth/
│   │   ├── login/page.tsx          # Login page
│   │   └── register/page.tsx       # Registration page
│   ├── dashboard/
│   │   ├── layout.tsx              # Dashboard layout (sidebar, navbar)
│   │   ├── page.tsx                # Dashboard overview
│   │   ├── monitors/
│   │   │   ├── page.tsx            # Monitors list with sparklines
│   │   │   └── [id]/page.tsx       # Monitor detail with charts
│   │   ├── incidents/page.tsx      # Incident management
│   │   └── settings/page.tsx       # Settings (profile, status pages, channels)
│   └── status/
│       └── [slug]/page.tsx         # Public status page viewer
├── components/
│   ├── auth-provider.tsx           # NextAuth SessionProvider
│   ├── theme-provider.tsx          # next-themes ThemeProvider
│   ├── create-monitor-dialog.tsx   # Monitor creation dialog
│   ├── edit-monitor-dialog.tsx     # Monitor edit dialog
│   ├── create-incident-dialog.tsx  # Manual incident creation
│   ├── delete-confirm-dialog.tsx   # Generic delete confirmation
│   ├── status-page-dialog.tsx      # Status page CRUD dialog
│   ├── notification-channel-dialog.tsx  # Notification channel CRUD
│   └── ui/                         # shadcn/ui components (50+)
├── lib/
│   ├── auth.ts                     # NextAuth configuration
│   ├── auth.config.ts              # Auth config (callbacks, pages)
│   ├── prisma.ts                   # Prisma client (Neon adapter)
│   ├── session.ts                  # getCurrentUserId() helper
│   ├── monitor-checker.ts          # Ping engine + incident logic
│   ├── notifications.ts            # Email & webhook dispatcher
│   ├── validations.ts              # Zod schemas for all entities
│   ├── utils.ts                    # cn() Tailwind utility
│   └── generated/prisma/           # Generated Prisma client
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── migrations/                 # Migration files
├── middleware.ts                    # Auth middleware (protects /dashboard/*)
├── prisma.config.ts                # Prisma config with dotenv
├── next.config.mjs                 # Next.js configuration
├── components.json                 # shadcn/ui configuration
├── package.json
├── tsconfig.json
└── pnpm-lock.yaml
```

---

## Database Schema

### Models

| Model | Description |
|---|---|
| **User** | Authenticated users with email/password. Roles: `ADMIN`, `USER`. |
| **Account** / **Session** | NextAuth adapter tables for OAuth and sessions. |
| **Monitor** | A URL to monitor. Has interval, region, status (`UP`, `DOWN`, `DEGRADED`, `PAUSED`). |
| **Check** | Individual ping result: status, response time (ms), HTTP code. Indexed by `[monitorId, createdAt]`. |
| **Incident** | Service outage record. Statuses: `INVESTIGATING` → `IDENTIFIED` → `MONITORING` → `RESOLVED`. |
| **IncidentUpdate** | Timeline entries for incidents (status changes with messages). |
| **StatusPage** | Public status page with custom slug, title, description, and selected monitors. |
| **NotificationChannel** | Email or Webhook notification destination. Per-user with enable/disable. |

### Entity Relationships

```
User ─┬─→ Monitor ─┬─→ Check
      │            └─→ Incident ─→ IncidentUpdate
      ├─→ StatusPage
      └─→ NotificationChannel
```

---

## API Reference

All API routes return JSON. Protected routes require an authenticated session (JWT cookie).

### Authentication API

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Create account (name, email, password) | No |
| POST | `/api/auth/[...nextauth]` | NextAuth sign-in/sign-out handlers | No |

### Monitors API

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/monitors` | List all monitors (includes last 30 checks) | Yes |
| POST | `/api/monitors` | Create a new monitor | Yes |
| GET | `/api/monitors/:id?range=24h\|7d\|30d` | Get monitor with checks and incidents | Yes |
| PATCH | `/api/monitors/:id` | Update monitor (name, url, interval, region, status) | Yes |
| DELETE | `/api/monitors/:id` | Delete monitor (cascading) | Yes |
| POST | `/api/monitors/:id/check` | Trigger an immediate check | Yes |

### Incidents API

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/incidents` | List all incidents for user's monitors | Yes |
| POST | `/api/incidents` | Create a manual incident | Yes |
| GET | `/api/incidents/:id` | Get incident with timeline | Yes |
| PATCH | `/api/incidents/:id` | Update status/summary/resolvedAt | Yes |
| DELETE | `/api/incidents/:id` | Delete incident | Yes |

### Status Pages API

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/status-pages` | List user's status pages | Yes |
| POST | `/api/status-pages` | Create status page (unique slug) | Yes |
| GET | `/api/status-pages/:id` | Get status page by ID | Yes |
| PATCH | `/api/status-pages/:id` | Update status page | Yes |
| DELETE | `/api/status-pages/:id` | Delete status page | Yes |
| GET | `/api/status-pages/public/:slug` | **Public** — get status page data | No |

### Notification Channels API

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/notification-channels` | List user's notification channels | Yes |
| POST | `/api/notification-channels` | Create channel (EMAIL or WEBHOOK) | Yes |
| PATCH | `/api/notification-channels/:id` | Update channel | Yes |
| DELETE | `/api/notification-channels/:id` | Delete channel | Yes |

### Cron API

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/cron?secret=<CRON_SECRET>` | Check all due monitors | Secret |

Returns:
```json
{
  "total": 5,
  "checked": 3,
  "results": [
    { "monitorId": "...", "name": "My API", "outcome": { "check": {...}, "newStatus": "UP" } }
  ]
}
```

---

## Monitoring Engine

The monitoring engine lives in `lib/monitor-checker.ts` and provides three core functions:

### `pingUrl(url: string): CheckResult`

- Sends a `GET` request to the URL with a **10-second timeout**
- Returns `{ status, responseTime, code }`
- Status logic:
  - HTTP 200–399 and response < 5000ms → `UP`
  - HTTP 200–399 and response > 5000ms → `DEGRADED`
  - HTTP 400+ → `DOWN`
  - Any error (timeout, network failure) → `DOWN` (code: `null`)

### `checkMonitor(monitorId: string)`

1. Pings the monitor's URL
2. Records a `Check` entry in the database
3. Updates the `Monitor` status and `lastCheckAt`
4. **If DOWN:** Creates an `Incident` (if none open) with an initial timeline entry. Sends DOWN notification on status change.
5. **If UP (was DOWN):** Auto-resolves all open incidents with RESOLVED timeline entry. Sends RECOVERY notification.

### `checkAllDueMonitors()`

1. Fetches all non-PAUSED monitors
2. Filters to those where elapsed time since last check exceeds their interval
3. Runs `checkMonitor()` in parallel for all due monitors
4. Returns a summary of results

---

## Notifications

Watchtower supports two notification channel types:

### Email (SMTP)

- Configured via `SMTP_*` environment variables
- Sends formatted HTML emails with monitor name, URL, status, HTTP code, and response time
- Subject lines: `🔴 DOWN: Monitor Name` / `🟢 RECOVERY: Monitor Name`

### Webhook

- Sends a JSON `POST` request to the configured URL with a 10-second timeout
- Payload:
  ```json
  {
    "event": "DOWN" | "RECOVERY",
    "monitor": { "name": "...", "url": "..." },
    "details": { "httpCode": 200, "responseTime": 150 },
    "timestamp": "2026-03-07T..."
  }
  ```

Notifications are sent **only on status change** (not on every check), preventing alert fatigue.

---

## Public Status Pages

Users can create public status pages accessible at `/status/<slug>` — no login required.

Each status page shows:
- Overall system status indicator
- Per-service status cards (UP/DOWN/DEGRADED)
- Recent incident history

Configured in Dashboard → Settings → Status Pages. Select which monitors to display and set a custom slug, title, and description.

---

## Dashboard

### Overview (`/dashboard`)

- **Stats cards:** Active monitors, up/total, overall uptime %, average response time, open incidents
- **Aggregate response time chart:** Area chart showing average response times across all monitors, bucketed into 5-minute intervals
- **Monitor list with sparklines:** Each monitor shows an inline area sparkline, uptime %, and average response time
- **Quick actions:** Links to add monitors, configure alerts, manage status pages
- **Recent incidents:** Open incidents with relative timestamps

### Monitors List (`/dashboard/monitors`)

- Create, edit, delete monitors via dialog forms
- Each monitor card shows: status indicator, name, URL, inline sparkline, uptime %, average response time, check interval, last checked
- Click through to monitor detail page

### Monitor Detail (`/dashboard/monitors/:id`)

- **Uptime bar:** 30-slot visual history bar (green/red/yellow segments)
- **Stats:** Status, avg/min/max/P95 response time, region, last check, total checks, created date
- **Response time chart:** Area chart with 24h/7d/30d time range selector
- **Recent checks table:** Status badges, response times, HTTP codes
- **Actions:** Check Now (manual trigger), Pause/Resume
- **Incident sidebar:** Recent incidents with resolution timestamps

### Incidents (`/dashboard/incidents`)

- Manual incident creation with monitor selection
- Status badges with severity color mapping
- Timeline entries with timestamps and messages
- Duration calculation for resolved incidents

### Settings (`/dashboard/settings`)

- Profile management
- Status page CRUD
- Notification channel CRUD (Email / Webhook)
- Security settings

---

## Deployment

### Deploy to Vercel

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com/)
3. Set all [environment variables](#environment-variables) in Vercel project settings
4. Deploy — Vercel auto-detects Next.js

### Cron Configuration

Add a `vercel.json` in the project root to schedule the monitoring cron job:

```json
{
  "crons": [
    {
      "path": "/api/cron?secret=YOUR_CRON_SECRET",
      "schedule": "* * * * *"
    }
  ]
}
```

This runs the monitor checker **every minute**. Vercel Cron Jobs are available on the Pro plan. On the Hobby plan, the minimum interval is every 24 hours.

**Alternative schedulers:**

- **GitHub Actions:** Create a workflow with `schedule` trigger that curls your `/api/cron` endpoint
- **cron-job.org:** Free external cron service — point it at `https://your-app.vercel.app/api/cron?secret=YOUR_CRON_SECRET`
- **Upstash QStash:** Serverless message queue with cron support

---

## Scripts

| Script | Command | Description |
|---|---|---|
| Dev | `pnpm dev` | Start development server |
| Build | `pnpm build` | Production build |
| Start | `pnpm start` | Start production server |
| Lint | `pnpm lint` | Run ESLint |
| Generate | `pnpm prisma generate` | Generate Prisma client |
| Migrate | `pnpm prisma migrate deploy` | Run database migrations |
| DB Push | `pnpm prisma db push` | Push schema without migration |
| Studio | `pnpm prisma studio` | Open Prisma Studio GUI |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## License

This project is open source under the [MIT License](LICENSE).
