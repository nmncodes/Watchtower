import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/monitors/:id
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const monitor = await prisma.monitor.findUnique({
      where: { id: params.id },
      include: {
        checks: { orderBy: { createdAt: "desc" }, take: 50 },
        incidents: { orderBy: { startedAt: "desc" }, take: 10, include: { timeline: true } },
      },
    });

    if (!monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    return NextResponse.json(monitor);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch monitor" }, { status: 500 });
  }
}

// PATCH /api/monitors/:id
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

    const monitor = await prisma.monitor.update({
      where: { id: params.id },
      data: body as any,
    });

    return NextResponse.json(monitor);
  } catch (error: any) {
    console.error(error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update monitor" }, { status: 500 });
  }
}

// DELETE /api/monitors/:id
export async function DELETE(
  _req: Request , 
  { params} : {params: {id : string}} 

) 
{
  try {
    await prisma.monitor.delete({where : {id : params.id}});
    return new NextResponse(null, {status : 204});
  }
  catch(error : any) {
    console.error(error);
    if(error?.code === "P2025") {
      
      return NextResponse.json({error : "Monitor not found"}, {status : 404});
    }
    return NextResponse.json({error : "Failed to delete monitor"}, {status : 500});
  }
}
