import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMonitorSchema, type CreateMonitorInput } from "@/lib/validations";
import { getCurrentMonitorActor } from "@/lib/session";
import { checkMonitor } from "@/lib/monitor-checker";

const CREATE_DEDUPE_WINDOW_MS = Number(process.env.MONITOR_CREATE_DEDUPE_WINDOW_MS ?? "30000");

function normalizeMonitorUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  return url.toString();
}

async function findRecentDuplicateMonitor(userId: string, input: CreateMonitorInput) {
  const safeWindow = Number.isFinite(CREATE_DEDUPE_WINDOW_MS)
    ? Math.max(1_000, CREATE_DEDUPE_WINDOW_MS)
    : 30_000;
  const windowStart = new Date(Date.now() - safeWindow);

  return prisma.monitor.findFirst({
    where: {
      userId,
      name: input.name,
      url: input.url,
      interval: input.interval,
      region: input.region,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: "asc" },
  });
}

// GET /api/monitors
export async function GET() {
  try {
    const actor = await getCurrentMonitorActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const monitors = await prisma.monitor.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
      include: {
        checks: {
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { status: true, responseTime: true, createdAt: true },
        },
      },
    });
    return NextResponse.json(monitors);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch monitors" }, { status: 500 });
  }
}

// POST /api/monitors
export async function POST(request: Request) {
  try {
    const actor = await getCurrentMonitorActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createMonitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const monitorInput: CreateMonitorInput = {
      ...parsed.data,
      name: parsed.data.name.trim(),
      url: normalizeMonitorUrl(parsed.data.url),
    };

    const recentDuplicate = await findRecentDuplicateMonitor(actor.userId, monitorInput);
    if (recentDuplicate) {
      return NextResponse.json(recentDuplicate);
    }

    const monitor = await prisma.monitor.create({
      data: { ...monitorInput, userId: actor.userId, status: "UP" },
    });

    // Run initial check immediately
    try {
      await checkMonitor(monitor.id);
    } catch (checkError) {
      console.error("Initial check failed for monitor:", monitor.id, checkError);
    }

    return NextResponse.json(monitor, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create monitor" }, { status: 500 });
  }
}




