import { NextResponse } from "next/server";
import { checkMonitor } from "@/lib/monitor-checker";
import { prisma } from "@/lib/prisma";
import { getCurrentMonitorActor } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  QUEUE_ENABLED,
  getMonitorChecksQueue,
} from "@/lib/queue";
import type { CheckRequestJob } from "@/lib/queue";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rateLimit = await checkRateLimit(10, 60_000, "manual-check");
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const actor = await getCurrentMonitorActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const monitor = await prisma.monitor.findFirst({
      where: { id, userId: actor.userId },
      include: { dependencies: { select: { id: true } } },
    });

    if (!monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    // ── Queue path: enqueue and return 202 ──
    if (QUEUE_ENABLED) {
      const payload: CheckRequestJob = {
        monitorId: monitor.id,
        url: monitor.url,
        region: monitor.region,
        name: monitor.name,
        userId: monitor.userId,
        interval: monitor.interval,
        dependencyIds: monitor.dependencies.map((d) => d.id),
      };

      const queue = getMonitorChecksQueue();
      await queue.add('manual-check', payload, {
        removeOnComplete: true,
        removeOnFail: true,
      });

      return NextResponse.json(
        { message: "Check enqueued", monitorId: monitor.id },
        { status: 202 }
      );
    }

    // ── Legacy synchronous path ──
    const result = await checkMonitor(id);
    if (!result) {
      return NextResponse.json(
        { error: "Monitor not found or paused" },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Manual check failed:", error);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
