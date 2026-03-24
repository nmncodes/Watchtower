import { NextResponse } from "next/server";
import { checkMonitor } from "@/lib/monitor-checker";
import { prisma } from "@/lib/prisma";
import { getCurrentMonitorActor } from "@/lib/session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const actor = await getCurrentMonitorActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const owned = await prisma.monitor.findFirst({
      where: { id, userId: actor.userId },
      select: { id: true },
    });

    if (!owned) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

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
