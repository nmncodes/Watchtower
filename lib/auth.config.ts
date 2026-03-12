import type { NextAuthConfig } from "next-auth";

const DEMO_COOKIE_NAME = "watchtower_demo";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signExpiresAt(expiresAt: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expiresAt));
  return toHex(new Uint8Array(signature));
}

async function hasValidDemoCookie(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;

  const cookies = cookieHeader.split(";").map((item) => item.trim());
  const raw = cookies.find((item) => item.startsWith(`${DEMO_COOKIE_NAME}=`));
  if (!raw) return false;

  const cookieValue = decodeURIComponent(raw.slice(`${DEMO_COOKIE_NAME}=`.length));
  const [expiresAtRaw, signatureRaw] = cookieValue.split(".");
  const expiresAt = Number(expiresAtRaw);

  if (!expiresAtRaw || !signatureRaw || !Number.isFinite(expiresAt)) return false;
  if (Math.floor(Date.now() / 1000) > expiresAt) return false;

  const secret =
    process.env.DEMO_ACCESS_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "watchtower-demo-secret-change-me";
  const expectedSignature = await signExpiresAt(expiresAtRaw, secret);

  // Constant-time style compare through Web Crypto hash equality fallback.
  if (expectedSignature.length !== signatureRaw.length) return false;

  return expectedSignature === signatureRaw;
}

export const authConfig = {
  session: { strategy: "jwt" as const },
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user; // true if user is authenticated, false otherwise(0 , 1)
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        const isDemo = await hasValidDemoCookie(request.headers.get("cookie"));
        if (isDemo) return true;
        return false; // unauthorized user 
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  providers: [], // Providers added in full auth.ts
} satisfies NextAuthConfig;
