import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMonitorSchema } from "@/lib/validations";
import { getCurrentUserId } from "@/lib/session";
import { checkMonitor } from "@/lib/monitor-checker";

// GET /api/monitors
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const monitors = await prisma.monitor.findMany({
      where: { userId },
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
    const userId = await getCurrentUserId();
    if (!userId) {
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

    const monitor = await prisma.monitor.create({
      data: { ...parsed.data, userId, status: "UP" },
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




