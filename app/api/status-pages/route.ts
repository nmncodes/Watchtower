import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createStatusPageSchema } from "@/lib/validations";
import { getCurrentMonitorActor } from "@/lib/session";

// GET /api/status-pages — list authenticated user's status pages
export async function GET() {
  try {
    const actor = await getCurrentMonitorActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pages = await prisma.statusPage.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(pages);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch status pages" }, { status: 500 });
  }
}

// POST /api/status-pages — create a status page
export async function POST(req: Request) {
  try {
    const actor = await getCurrentMonitorActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createStatusPageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Check slug uniqueness
    const existing = await prisma.statusPage.findUnique({
      where: { slug: parsed.data.slug },
    });
    if (existing) {
      return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }

    const page = await prisma.statusPage.create({
      data: { ...parsed.data, userId: actor.userId },
    });
    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create status page" }, { status: 500 });
  }
}
