/**
 * Next.js instrumentation entrypoint.
 *
 * Scheduling is intentionally handled by an external cron provider
 * (for example cron-job.org) calling /api/cron.
 */
export async function onRequestError() {
  // required export — no-op
}

export async function register() {
  // External schedulers invoke /api/cron directly
}
