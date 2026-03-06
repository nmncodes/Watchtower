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
