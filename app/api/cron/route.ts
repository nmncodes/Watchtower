import { NextResponse } from "next/server";
import { checkAllDueMonitors } from "@/lib/monitor-checker";
import { checkRateLimit } from "@/lib/rate-limit";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  QUEUE_ENABLED,
  getMonitorChecksQueue,
} from "@/lib/queue";
import type { CheckRequestJob } from "@/lib/queue";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CRON_SECRET = process.env.CRON_SECRET;

const MIN_EFFECTIVE_INTERVAL_SECONDS = Number(
  process.env.MONITOR_MIN_EFFECTIVE_INTERVAL_SECONDS ?? "30"
);

/**
 * GET /api/cron — Called by an external scheduler (Vercel Cron, GitHub Actions, etc.)
 *
 * When QUEUE_ENABLED=true: enqueues due monitors to BullMQ and returns immediately.
 * When QUEUE_ENABLED=false: runs checks synchronously (legacy behavior).
 */
export async function GET(req: Request) {
  const diagnostics = {
    vercelId: req.headers.get("x-vercel-id") || "unknown",
    vercelRegion: req.headers.get("x-vercel-region") || "unknown",
    cfRay: req.headers.get("cf-ray") || "unknown",
    cfIpCountry: req.headers.get("cf-ipcountry") || "unknown",
    cfConnectingIp: req.headers.get("cf-connecting-ip") || "unknown",
    xForwardedFor: req.headers.get("x-forwarded-for") || "unknown",
    xRealIp: req.headers.get("x-real-ip") || "unknown",
  };

  console.log("Cron request diagnostics:", diagnostics);

  // Fetch the public IP of this serverless function
  let runnerIp = "unknown";
  try {
    const ipRes = await fetch("https://ifconfig.me/ip");
    runnerIp = (await ipRes.text()).trim();
  } catch (err) {
    console.error("Failed to fetch runner IP", err);
  }

  // Verify auth if CRON_SECRET is set
  if (CRON_SECRET) {
    const url = new URL(req.url);
    const secret =
      url.searchParams.get("secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (!secret || !safeCompare(secret, CRON_SECRET)) {
      return NextResponse.json(
        { error: "Unauthorized", runnerIp, diagnostics },
        { status: 401 }
      );
    }
  }

  const rateLimit = await checkRateLimit(2, 60_000, "cron");
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many requests", runnerIp, diagnostics },
      { status: 429 }
    );
  }

  // ── Queue path: enqueue check requests and return immediately ──
  if (QUEUE_ENABLED) {
    try {
      const now = new Date();

      const monitors = await prisma.monitor.findMany({
        where: { status: { not: "PAUSED" } },
        include: {
          dependencies: { select: { id: true } },
        },
      });

      const due = monitors.filter((m) => {
        if (!m.lastCheckAt) return true;
        const elapsed = (now.getTime() - m.lastCheckAt.getTime()) / 1000;
        const effectiveInterval = Math.max(
          m.interval,
          MIN_EFFECTIVE_INTERVAL_SECONDS
        );
        return elapsed >= effectiveInterval;
      });

      if (due.length === 0) {
        return NextResponse.json({
          mode: "queue",
          total: monitors.length,
          enqueued: 0,
          runnerIp,
          diagnostics,
        });
      }

      const queue = getMonitorChecksQueue();
      const jobs = due.map((m) => {
        const payload: CheckRequestJob = {
          monitorId: m.id,
          url: m.url,
          region: m.region,
          name: m.name,
          userId: m.userId,
          interval: m.interval,
          dependencyIds: m.dependencies.map((d) => d.id),
        };
        return {
          name: 'scheduled-check',
          data: payload,
          opts: {
            jobId: `cron-${m.id}-${now.getTime()}`,
            removeOnComplete: true,
            removeOnFail: true,
          }
        };
      });

      await queue.addBulk(jobs);

      console.log(
        `[Cron/BullMQ] Enqueued ${due.length}/${monitors.length} monitors`
      );

      return NextResponse.json({
        mode: "queue",
        total: monitors.length,
        enqueued: due.length,
        runnerIp,
        diagnostics,
      });
    } catch (error) {
      console.error("Cron Queue enqueue failed:", error);
      return NextResponse.json(
        { error: "Cron Queue enqueue failed", runnerIp, diagnostics },
        { status: 500 }
      );
    }
  }

  // ── Legacy synchronous path ──
  try {
    const result = await checkAllDueMonitors();
    return NextResponse.json({ mode: "sync", ...result, runnerIp, diagnostics });
  } catch (error) {
    console.error("Cron check failed:", error);
    return NextResponse.json(
      { error: "Cron check failed", runnerIp, diagnostics },
      { status: 500 }
    );
  }
}
