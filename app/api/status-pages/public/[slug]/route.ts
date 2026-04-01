import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/status-pages/public/:slug — public, no auth required
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const page = await prisma.statusPage.findUnique({
      where: { slug },
    });

    if (!page || !page.isPublic) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Fetch monitors selected for this status page
    const monitors =
      page.monitorIds.length > 0
        ? await prisma.monitor.findMany({
            where: { id: { in: page.monitorIds } },
            select: {
              id: true,
              name: true,
              url: true,
              status: true,
              checks: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  createdAt: true,
                  regionResults: {
                    select: {
                      region: true,
                      status: true,
                      responseTime: true,
                      code: true,
                    },
                    orderBy: { region: "asc" },
                  },
                },
              },
            },
          })
        : [];

    const monitorsWithRegions = monitors.map((monitor) => {
      const latestCheck = monitor.checks[0];
      return {
        id: monitor.id,
        name: monitor.name,
        url: monitor.url,
        status: monitor.status,
        lastCheckAt: latestCheck?.createdAt ?? null,
        regionalStatus: latestCheck?.regionResults ?? [],
      };
    });

    // Fetch recent incidents for those monitors
    const incidents =
      page.monitorIds.length > 0
        ? await prisma.incident.findMany({
            where: { monitorId: { in: page.monitorIds } },
            orderBy: { startedAt: "desc" },
            take: 10,
            include: { monitor: { select: { id: true, name: true } } },
          })
        : [];

    return NextResponse.json({
      title: page.title,
      description: page.description,
      slug: page.slug,
      monitors: monitorsWithRegions,
      incidents,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load status page" }, { status: 500 });
  }
}
