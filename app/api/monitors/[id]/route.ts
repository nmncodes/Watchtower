import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateMonitorSchema } from "@/lib/validations";
import { getCurrentMonitorActor } from "@/lib/session";
import { getDemoMonitorExpiryCutoff } from "@/lib/demo";

async function pruneExpiredDemoMonitors(userId: string) {
  await prisma.monitor.deleteMany({
    where: {
      userId,
      createdAt: { lt: getDemoMonitorExpiryCutoff() },
    },
  });
}

// GET /api/monitors/:id
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "24h";

  const actor = await getCurrentMonitorActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (actor.isDemo) {
    await pruneExpiredDemoMonitors(actor.userId);
  }

  // Compute date cutoff based on range
  const now = new Date();
  const cutoff = new Date(now);
  if (range === "7d") {
    cutoff.setDate(cutoff.getDate() - 7);
  } else if (range === "30d") {
    cutoff.setDate(cutoff.getDate() - 30);
  } else {
    cutoff.setHours(cutoff.getHours() - 24);
  }

  try {
    const monitor = await prisma.monitor.findFirst({
      where: { id, userId: actor.userId },
      include: {
        checks: {
          where: { createdAt: { gte: cutoff } },
          orderBy: { createdAt: "desc" },
          take: 500,
        },
        incidents: { orderBy: { startedAt: "desc" }, take: 10, include: { timeline: true } },
      },
    });

    if (!monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    return NextResponse.json(monitor);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch monitor" }, { status: 500 });
  }
}

// PATCH /api/monitors/:id
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const actor = await getCurrentMonitorActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (actor.isDemo) {
    await pruneExpiredDemoMonitors(actor.userId);
  }

  try {
    const body = await req.json();
    const parsed = updateMonitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await prisma.monitor.findFirst({
      where: { id, userId: actor.userId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    const monitor = await prisma.monitor.update({ where: { id }, data: parsed.data });

    return NextResponse.json(monitor);
  } catch (error: any) {
    console.error(error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update monitor" }, { status: 500 });
  }
}

// DELETE /api/monitors/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const actor = await getCurrentMonitorActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (actor.isDemo) {
    await pruneExpiredDemoMonitors(actor.userId);
  }

  try {
    const existing = await prisma.monitor.findFirst({
      where: { id, userId: actor.userId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    await prisma.monitor.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error(error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete monitor" }, { status: 500 });
  }
}
