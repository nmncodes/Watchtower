import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/incidents/:id
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: params.id },
      include: {
        monitor: { select: { id: true, name: true } },
        timeline: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    return NextResponse.json(incident);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch incident" }, { status: 500 });
  }
}

// PATCH /api/incidents/:id — update status, summary, resolvedAt
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

    const incident = await prisma.incident.update({
      where: { id: params.id },
      data: body as any,
      include: { monitor: { select: { id: true, name: true } } },
    });

    return NextResponse.json(incident);
  } catch (error: any) {
    console.error(error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update incident" }, { status: 500 });
  }
}

// DELETE /api/incidents/:id
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.incident.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error(error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete incident" }, { status: 500 });
  }
}
