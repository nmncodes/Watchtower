import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

interface NotificationPayload {
  monitorName: string;
  monitorUrl: string;
  event: "DOWN" | "RECOVERY";
  httpCode: number | null;
  responseTime: number;
}

/**
 * Send notifications to all enabled channels for a monitor's owner.
 */
export async function sendNotifications(
  userId: string,
  payload: NotificationPayload
) {
  const channels = await prisma.notificationChannel.findMany({
    where: { userId, enabled: true },
  });

  if (channels.length === 0) return;

  const results = await Promise.allSettled(
    channels.map((ch) => {
      switch (ch.type) {
        case "EMAIL":
          return sendEmailNotification(ch.target, payload);
        case "WEBHOOK":
          return sendWebhookNotification(ch.target, payload);
        default:
          return Promise.resolve();
      }
    })
  );

  // Log failures (non-blocking)
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(
        `Notification failed for channel ${channels[i].id} (${channels[i].type}):`,
        r.reason
      );
    }
  });
}

// Email

function getMailTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmailNotification(
  to: string,
  payload: NotificationPayload
) {
  const transport = getMailTransport();
  const isDown = payload.event === "DOWN";

  const subject = isDown
    ? `🔴 DOWN: ${payload.monitorName}`
    : `🟢 RECOVERY: ${payload.monitorName}`;

  const html = `
    <div style="font-family:sans-serif;max-width:480px">
      <h2 style="color:${isDown ? "#dc2626" : "#16a34a"}">
        ${isDown ? "Monitor Down" : "Monitor Recovered"}
      </h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:4px 8px;font-weight:600">Monitor</td><td style="padding:4px 8px">${payload.monitorName}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:600">URL</td><td style="padding:4px 8px">${payload.monitorUrl}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:600">Status</td><td style="padding:4px 8px">${isDown ? "DOWN" : "UP"}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:600">HTTP Code</td><td style="padding:4px 8px">${payload.httpCode ?? "timeout"}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:600">Response Time</td><td style="padding:4px 8px">${payload.responseTime}ms</td></tr>
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:16px">Sent by Watchtower, Reply if you have any questions.</p>
    </div>
  `;

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}

// Webhook 

async function sendWebhookNotification(
  url: string,
  payload: NotificationPayload
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: payload.event,
        monitor: {
          name: payload.monitorName,
          url: payload.monitorUrl,
        },
        details: {
          httpCode: payload.httpCode,
          responseTime: payload.responseTime,
        },
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Webhook returned ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
