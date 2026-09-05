import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type UserRole = "ADMIN" | "USER";

export type MonitorActor = {
  userId: string;
  role: UserRole;
  email?: string | null;
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
  if (!session?.user?.id) {
    return null;
  }

  // When DATABASE_URL changes between environments, stale cookies may point to
  // users that do not exist in the current database.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, email: true },
  });

  if (!user) {
    return null;
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const isAdminByEmail = Boolean(adminEmail && user.email?.toLowerCase() === adminEmail);
  const role: UserRole = user.role === "ADMIN" || isAdminByEmail ? "ADMIN" : "USER";

  return { userId: user.id, role, email: user.email };
}
