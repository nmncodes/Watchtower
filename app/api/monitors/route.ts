import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMonitorSchema } from "@/lib/validations";
import { getCurrentMonitorActor } from "@/lib/session";
import { checkMonitor } from "@/lib/monitor-checker";
import { getDemoMonitorExpiryCutoff } from "@/lib/demo";

async function pruneExpiredDemoMonitors(userId: string) {
  await prisma.monitor.deleteMany({
    where: {
      userId,
      createdAt: { lt: getDemoMonitorExpiryCutoff() },
    },
  });
}

// GET /api/monitors
export async function GET() {
  try {
    const actor = await getCurrentMonitorActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (actor.isDemo) {
      await pruneExpiredDemoMonitors(actor.userId);
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

    if (actor.isDemo) {
      await pruneExpiredDemoMonitors(actor.userId);

      const demoMonitorCount = await prisma.monitor.count({
        where: { userId: actor.userId },
      });

      if (demoMonitorCount >= 2) {
        return NextResponse.json(
          { error: "Demo accounts can create up to 2 monitors" },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const parsed = createMonitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const monitor = await prisma.monitor.create({
      data: { ...parsed.data, userId: actor.userId, status: "UP" },
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




