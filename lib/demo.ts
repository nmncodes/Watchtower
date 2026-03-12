import crypto from "crypto";

export const DEMO_COOKIE_NAME = "watchtower_demo";
const DEMO_COOKIE_TTL_SECONDS = 60 * 60 * 8;
const DEFAULT_DEMO_MONITOR_TTL_MINUTES = 15;

export type DemoActor = {
  userId: string;
  isDemo: true;
};

function getDemoSecret(): string {
  return (
    process.env.DEMO_ACCESS_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "watchtower-demo-secret-change-me"
  );
}

export function getDemoUserId(): string {
  return process.env.DEMO_USER_ID || "watchtower_demo_user";
}

export function getDemoUserEmail(): string {
  return process.env.DEMO_USER_EMAIL || "demo@watchtower.local";
}

export function createDemoCookieValue(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + DEMO_COOKIE_TTL_SECONDS;
  const signature = crypto
    .createHmac("sha256", getDemoSecret())
    .update(String(expiresAt))
    .digest("hex");

  return `${expiresAt}.${signature}`;
}

export function verifyDemoCookieValue(value?: string | null): boolean {
  if (!value) return false;

  const [expiresAtRaw, signatureRaw] = value.split(".");
  const expiresAt = Number(expiresAtRaw);

  if (!expiresAtRaw || !signatureRaw || !Number.isFinite(expiresAt)) {
    return false;
  }

  if (Math.floor(Date.now() / 1000) > expiresAt) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", getDemoSecret())
    .update(String(expiresAt))
    .digest("hex");

  const actual = Buffer.from(signatureRaw, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
}

export function getDemoCookieMaxAge(): number {
  return DEMO_COOKIE_TTL_SECONDS;
}

export function getDemoMonitorTtlMinutes(): number {
  const raw = process.env.DEMO_MONITOR_TTL_MINUTES;
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DEMO_MONITOR_TTL_MINUTES;
  }

  return Math.floor(parsed);
}

export function getDemoMonitorExpiryCutoff(now = new Date()): Date {
  return new Date(now.getTime() - getDemoMonitorTtlMinutes() * 60 * 1000);
}