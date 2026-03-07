import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";
import { sendNotifications } from "@/lib/notifications";

// POST /api/notification-channels/:id/test — Send a test notification
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const channel = await prisma.notificationChannel.findFirst({
      where: { id, userId },
    });
    if (!channel) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Send a test notification through this specific channel
    await sendNotifications(userId, {
      monitorName: "Test Monitor",
      monitorUrl: "https://example.com",
      event: "DOWN",
      httpCode: 503,
      responseTime: 5000,
    });

    return NextResponse.json({ ok: true, message: "Test notification sent" });
  } catch (error) {
    console.error("Test notification failed:", error);
    return NextResponse.json(
      { error: "Failed to send test notification", details: String(error) },
      { status: 500 }
    );
  }
}
