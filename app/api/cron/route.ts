import { NextResponse } from "next/server";
import { checkAllDueMonitors } from "@/lib/monitor-checker";
import { checkRateLimit } from "@/lib/rate-limit";
import { timingSafeEqual } from "crypto";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

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
  console.log("Cron request from region:", req.headers.get("x-vercel-id") || "local");

  // Verify auth if CRON_SECRET is set
  if (CRON_SECRET) {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
    if (!secret || !safeCompare(secret, CRON_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const rateLimit = await checkRateLimit(2, 60_000, "cron");
  if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const result = await checkAllDueMonitors();
    return NextResponse.json({ ...result });
  } catch (error) {
    console.error("Cron check failed:", error);
    return NextResponse.json({ error: "Cron check failed" }, { status: 500 });
  }
}
