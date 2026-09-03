import { NextResponse } from "next/server";

export async function GET() {
  // by claude
  return NextResponse.json({ status: "alive" });
}
