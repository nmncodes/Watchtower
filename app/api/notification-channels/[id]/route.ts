import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateNotificationChannelSchema } from "@/lib/validations";
import { getCurrentUserId } from "@/lib/session";

// PATCH /api/notification-channels/:id
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const existing = await prisma.notificationChannel.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateNotificationChannelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const channel = await prisma.notificationChannel.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(channel);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}

// DELETE /api/notification-channels/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const existing = await prisma.notificationChannel.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.notificationChannel.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
  }
}
