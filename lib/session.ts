import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import {
  DEMO_COOKIE_NAME,
  getDemoUserId,
  verifyDemoCookieValue,
} from "@/lib/demo";

export type MonitorActor = {
  userId: string;
  isDemo: boolean;
};

/*
  Get the authenticated user's ID from the session.
  Returns null if not authenticated.
*/
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getCurrentMonitorActor(): Promise<MonitorActor | null> {
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, isDemo: false };
  }

  const cookieStore = await cookies();
  const demoCookie = cookieStore.get(DEMO_COOKIE_NAME)?.value;
  if (verifyDemoCookieValue(demoCookie)) {
    return { userId: getDemoUserId(), isDemo: true };
  }

  return null;
}
