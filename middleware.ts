import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;
// dashboard protection 
export const config = {
  matcher: ["/dashboard/:path*"],
};
