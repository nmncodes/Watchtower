import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMonitorSchema } from "@/lib/validations";

// Temporary: upsert a default dev user until auth is added (Phase 5)
async function getDefaultUserId() {
  const user = await prisma.user.upsert({
    where: { email: "dev@watchtower.local" },
    update: {},
    create: { email: "dev@watchtower.local", name: "Dev User" },
  });
  return user.id;
}

// GET /api/monitors
export async function GET() {
  try {
    const monitors = await prisma.monitor.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(monitors);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch monitors" }, { status: 500 });
  }
}

// POST /api/monitors
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createMonitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const userId = await getDefaultUserId();
    const monitor = await prisma.monitor.create({
      data: { ...parsed.data, userId },
    });
    return NextResponse.json(monitor, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create monitor" }, { status: 500 });
  }
}




