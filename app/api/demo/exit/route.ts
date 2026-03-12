import { NextRequest, NextResponse } from "next/server";
import { DEMO_COOKIE_NAME } from "@/lib/demo";

function getSafeRedirectPath(input: string | null): string {
  if (!input) return "/";
  if (!input.startsWith("/") || input.startsWith("//")) return "/";
  return input;
}

export async function GET(request: NextRequest) {
  const nextPath = getSafeRedirectPath(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(nextPath, request.url));

  response.cookies.set(DEMO_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });

  return response;
}