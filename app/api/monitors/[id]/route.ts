import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateMonitorSchema } from "@/lib/validations";

// GET /api/monitors/:id
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const monitor = await prisma.monitor.findUnique({
      where: { id },
      include: {
        checks: { orderBy: { createdAt: "desc" }, take: 50 },
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
  try {
    const body = await req.json();
    const parsed = updateMonitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const monitor = await prisma.monitor.update({
      where: { id },
      data: parsed.data,
    });

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
  try {
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
