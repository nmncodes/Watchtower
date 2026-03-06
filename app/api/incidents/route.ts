import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/incidents — list all incidents
export async function GET() {
  try {
    const incidents = await prisma.incident.findMany({
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
    const body = await req.json();

    const incident = await prisma.incident.create({
      data: {
        monitorId: body.monitorId,
        summary: body.summary ?? null,
        status: body.status ?? "INVESTIGATING",
      },
      include: { monitor: { select: { id: true, name: true } } },
    });
    // Error code 201
    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create incident" }, { status: 500 });
  }
}
