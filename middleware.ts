import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;
// dashboard protection 
// by claude 
export const config = {
  matcher: ["/dashboard/:path*"],
};
