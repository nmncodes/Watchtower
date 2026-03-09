import { NextResponse } from "next/server";
import { checkAllDueMonitors } from "@/lib/monitor-checker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Secure the cron endpoint with a secret token
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron — Called by an external scheduler (Vercel Cron, GitHub Actions, etc.)
 * Checks all monitors that are due based on their interval.
 *
 * Requires ?secret=<CRON_SECRET> or Authorization header in production.
 * In dev (no CRON_SECRET set), runs without auth.
 */
export async function GET(req: Request) {
  // Verify auth if CRON_SECRET is set
  if (CRON_SECRET) {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await checkAllDueMonitors();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Cron check failed:", error);
    return NextResponse.json({ error: "Cron check failed" }, { status: 500 });
  }
}
