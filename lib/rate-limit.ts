import { headers } from 'next/headers';

const rateLimit = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(
  limit: number = 60,
  windowMs: number = 60_000,
  identifier?: string
): Promise<{ success: boolean; remaining: number }> {
  const headerStore = await headers();
  // Vercel proxy headers
  const forwardedFor = headerStore.get('x-forwarded-for');
  const realIp = headerStore.get('x-real-ip');
  const fallbackIp = 'unknown';
  
  let ip = forwardedFor ? forwardedFor.split(',')[0].trim() : realIp || fallbackIp;
  if (identifier) {
    ip = `${identifier}-${ip}`;
  }

  const now = Date.now();
  const entry = rateLimit.get(ip);

  // Periodically clean up old entries to prevent memory leaks in long-running processes
  if (rateLimit.size > 10000) {
      const now = Date.now();
      for (const [key, value] of rateLimit.entries()) {
          if (now > value.resetAt) {
              rateLimit.delete(key);
          }
      }
  }

  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  entry.count++;
  if (entry.count > limit) {
    return { success: false, remaining: 0 };
  }
  return { success: true, remaining: limit - entry.count };
}
