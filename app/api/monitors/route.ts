import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


// get route 

export async function GET() {
  try{
    const monitors = await prisma.monitor.findMany() ;

    return NextResponse.json(monitors);
  }
  catch(error ) {
    return new NextResponse(JSON.stringify({error : "Failed to fetch monitors"}), {status : 500});
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const monitor = await prisma.monitor.create({ data: body as any });
    return NextResponse.json(monitor, { status: 201 });
  } catch (error) {
    console.error(error);
    return new NextResponse(JSON.stringify({ error: "Failed to create monitor" }), { status: 500 });
  }
}




