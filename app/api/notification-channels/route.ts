import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotificationChannelSchema } from "@/lib/validations";
import { getCurrentMonitorActor } from "@/lib/session";

// GET /api/notification-channels
export async function GET() {
  try {
    const actor = await getCurrentMonitorActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const channels = await prisma.notificationChannel.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(channels);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}

// POST /api/notification-channels
export async function POST(request: Request) {
  try {
    const actor = await getCurrentMonitorActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createNotificationChannelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const channel = await prisma.notificationChannel.create({
      data: { ...parsed.data, userId: actor.userId },
    });
    return NextResponse.json(channel, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create channel" }, { status: 500 });
  }
}
