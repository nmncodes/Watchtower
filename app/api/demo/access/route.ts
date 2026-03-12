import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createDemoCookieValue,
  DEMO_COOKIE_NAME,
  getDemoCookieMaxAge,
  getDemoUserEmail,
  getDemoUserId,
} from "@/lib/demo";

function getSafeRedirectPath(input: string | null): string {
  if (!input) return "/demo/workspace";
  if (!input.startsWith("/") || input.startsWith("//")) return "/demo/workspace";
  return input;
}

export async function GET(request: NextRequest) {
  const nextPath = getSafeRedirectPath(request.nextUrl.searchParams.get("next"));

  try {
    await prisma.user.upsert({
      where: { id: getDemoUserId() },
      update: {},
      create: {
        id: getDemoUserId(),
        email: getDemoUserEmail(),
        name: "Watchtower Demo",
      },
    });
  } catch (error) {
    console.error("Failed to ensure demo user exists", error);
    return NextResponse.json({ error: "Failed to start demo" }, { status: 500 });
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set(DEMO_COOKIE_NAME, createDemoCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: getDemoCookieMaxAge(),
    path: "/",
  });

  return response;
}