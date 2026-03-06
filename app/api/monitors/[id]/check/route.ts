import { NextResponse } from "next/server";
import { checkMonitor } from "@/lib/monitor-checker";

// POST /api/monitors/:id/check — manually trigger a check for one monitor
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await checkMonitor(id);
    if (!result) {
      return NextResponse.json(
        { error: "Monitor not found or paused" },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Manual check failed:", error);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
