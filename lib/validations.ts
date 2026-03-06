import { z } from "zod";

// ── Monitor schemas ────────────────────────────────────────

export const createMonitorSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  url: z.string().url("Must be a valid URL"),
  interval: z.coerce.number().int().min(10, "Min 10s").max(3600, "Max 3600s").default(60),
  region: z.string().min(1).default("us-east-1"),
});

export const monitorStatusEnum = z.enum(["UP", "DOWN", "DEGRADED", "PAUSED"]);

export const updateMonitorSchema = createMonitorSchema.partial().extend({
  status: monitorStatusEnum.optional(),
});

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

// ── Incident schemas ───────────────────────────────────────

export const incidentStatusEnum = z.enum([
  "INVESTIGATING",
  "IDENTIFIED",
  "MONITORING",
  "RESOLVED",
]);

export const createIncidentSchema = z.object({
  monitorId: z.string().min(1, "Monitor is required"),
  summary: z.string().min(1, "Summary is required").max(500),
  status: incidentStatusEnum.default("INVESTIGATING"),
});

export const updateIncidentSchema = z.object({
  status: incidentStatusEnum.optional(),
  summary: z.string().max(500).optional(),
  resolvedAt: z.string().datetime().optional().nullable(),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

// ── Status Page schemas ────────────────────────────────────

export const createStatusPageSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(300).optional(),
  monitorIds: z.array(z.string()).default([]),
  isPublic: z.boolean().default(true),
});

export const updateStatusPageSchema = createStatusPageSchema.partial();

export type CreateStatusPageInput = z.infer<typeof createStatusPageSchema>;
export type UpdateStatusPageInput = z.infer<typeof updateStatusPageSchema>;

// ── Notification Channel schemas ───────────────────────────

export const notificationChannelTypeEnum = z.enum(["EMAIL", "WEBHOOK"]);

export const createNotificationChannelSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: notificationChannelTypeEnum,
  target: z.string().min(1, "Target is required").max(500),
  enabled: z.boolean().default(true),
});

export const updateNotificationChannelSchema = createNotificationChannelSchema.partial();

export type CreateNotificationChannelInput = z.infer<typeof createNotificationChannelSchema>;
export type UpdateNotificationChannelInput = z.infer<typeof updateNotificationChannelSchema>;
