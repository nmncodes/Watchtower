import { auth } from "@/lib/auth";

export type MonitorActor = {
  userId: string;
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
    return { userId: session.user.id };
  }

  return null;
}
