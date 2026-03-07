/**
 * Next.js Instrumentation — runs once when the server starts.
 * Sets up a background scheduler that checks all due monitors on a loop.
 */
export async function onRequestError() {
  // required export — no-op
}

export async function register() {
  // Only run the scheduler on the server (Node.js runtime), not during build or on the edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const POLL_INTERVAL_MS = 10_000; // 10 seconds

    // Avoid duplicate intervals if hot-reloading in dev
    const globalObj = globalThis as typeof globalThis & { __monitorScheduler?: ReturnType<typeof setInterval> };

    if (!globalObj.__monitorScheduler) {
      console.log("[Watchtower] Starting monitor scheduler (every 10s)");

      const runChecks = async () => {
        try {
          const { checkAllDueMonitors } = await import("@/lib/monitor-checker");
          const result = await checkAllDueMonitors();
          if (result.checked > 0) {
            console.log(
              `[Watchtower] Checked ${result.checked}/${result.total} monitors`
            );
          }
        } catch (err) {
          console.error("[Watchtower] Scheduler error:", err);
        }
      };

      // Run once immediately, then on a loop
      runChecks();
      globalObj.__monitorScheduler = setInterval(runChecks, POLL_INTERVAL_MS);
    }
  }
}
