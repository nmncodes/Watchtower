import { DefaultSession } from "next-auth";

declare module "next-auth" {
  // attach user id to session object 
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
