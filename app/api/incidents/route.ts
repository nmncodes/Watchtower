import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createIncidentSchema } from "@/lib/validations";
import { getCurrentUserId } from "@/lib/session";

// GET /api/incidents — list incidents for the authenticated user's monitors
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const incidents = await prisma.incident.findMany({
      where: { monitor: { userId } },
      orderBy: { startedAt: "desc" },
      include: {
        monitor: { select: { id: true, name: true } },
        timeline: { orderBy: { createdAt: "desc" } },
      },
    });

    return NextResponse.json(incidents);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch incidents" }, { status: 500 });
  }
}

// POST /api/incidents — create an incident
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createIncidentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify the monitor belongs to this user
    const monitor = await prisma.monitor.findFirst({
      where: { id: parsed.data.monitorId, userId },
    });
    if (!monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    const incident = await prisma.incident.create({
      data: parsed.data,
      include: { monitor: { select: { id: true, name: true } } },
    });
    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create incident" }, { status: 500 });
  }
}
