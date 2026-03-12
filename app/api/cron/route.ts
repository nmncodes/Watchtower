import { NextResponse } from "next/server";
import { checkAllDueMonitors } from "@/lib/monitor-checker";
import { prisma } from "@/lib/prisma";
import { getDemoMonitorExpiryCutoff, getDemoUserId } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Secure the cron endpoint with a secret token
const CRON_SECRET = process.env.CRON_SECRET;
const DEMO_DAILY_CLEANUP_ENABLED = process.env.DEMO_DAILY_CLEANUP_ENABLED === "true";
const DEMO_CLEANUP_HOUR_UTC = Number(process.env.DEMO_CLEANUP_HOUR_UTC ?? "3");

function shouldRunDailyDemoCleanup(now: Date): boolean {
  if (!DEMO_DAILY_CLEANUP_ENABLED) return false;
  if (!Number.isInteger(DEMO_CLEANUP_HOUR_UTC) || DEMO_CLEANUP_HOUR_UTC < 0 || DEMO_CLEANUP_HOUR_UTC > 23) {
    return false;
  }

  // Run cleanup once in a narrow UTC window so frequent cron schedules can still trigger it.
  return now.getUTCHours() === DEMO_CLEANUP_HOUR_UTC && now.getUTCMinutes() < 5;
}

async function cleanupDemoWorkspaceData() {
  const demoUserId = getDemoUserId();
  const [monitors, statusPages, channels] = await Promise.all([
    prisma.monitor.deleteMany({ where: { userId: demoUserId } }),
    prisma.statusPage.deleteMany({ where: { userId: demoUserId } }),
    prisma.notificationChannel.deleteMany({ where: { userId: demoUserId } }),
  ]);

  return {
    monitorsDeleted: monitors.count,
    statusPagesDeleted: statusPages.count,
    notificationChannelsDeleted: channels.count,
  };
}

async function cleanupExpiredDemoMonitors() {
  const result = await prisma.monitor.deleteMany({
    where: {
      userId: getDemoUserId(),
      createdAt: { lt: getDemoMonitorExpiryCutoff() },
    },
  });

  return result.count;
}

/**
 * GET /api/cron — Called by an external scheduler (Vercel Cron, GitHub Actions, etc.)
 * Checks all monitors that are due based on their interval.
 *
 * Requires ?secret=<CRON_SECRET> or Authorization header in production.
 * In dev (no CRON_SECRET set), runs without auth.
 */
export async function GET(req: Request) {
  console.log("Cron request from region:", req.headers.get("x-vercel-id") || "local");

  // Verify auth if CRON_SECRET is set
  if (CRON_SECRET) {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    let demoCleanup: {
      executed: boolean;
      monitorsDeleted: number;
      statusPagesDeleted: number;
      notificationChannelsDeleted: number;
    } = {
      executed: false,
      monitorsDeleted: 0,
      statusPagesDeleted: 0,
      notificationChannelsDeleted: 0,
    };

    const now = new Date();
    if (shouldRunDailyDemoCleanup(now)) {
      const cleanupResult = await cleanupDemoWorkspaceData();
      demoCleanup = { executed: true, ...cleanupResult };
    }

    const expiredDemoMonitorsDeleted = await cleanupExpiredDemoMonitors();

    const result = await checkAllDueMonitors();
    return NextResponse.json({ ...result, demoCleanup, expiredDemoMonitorsDeleted });
  } catch (error) {
    console.error("Cron check failed:", error);
    return NextResponse.json({ error: "Cron check failed" }, { status: 500 });
  }
}
