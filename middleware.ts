import { NextResponse, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_API_PATHS = ["/api/auth", "/api/cron", "/api/health"];

// by claude
export default auth(async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicApiRoute = PUBLIC_API_PATHS.some((publicPath) => {
    if (publicPath === "/api/cron") {
      return pathname === publicPath;
    }
    return pathname.startsWith(publicPath);
  });
  const isDashboardRoute = pathname.startsWith("/dashboard");

  const session = await auth();

  if (isApiRoute && !isPublicApiRoute) {
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (isDashboardRoute && !session?.user) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};

