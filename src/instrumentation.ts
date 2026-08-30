/**
 * Next.js boot hook. Runs once per server instance, before the first request.
 *
 * The idempotent `ensure*Schema()` helpers used to be awaited inside
 * /api/health, which meant five schema-reconciliation queries ran on every
 * single ping. Uptime monitors and the deploy smoke check hit that endpoint
 * frequently, so a health probe was doing real DDL-guard work each time and
 * a public request could hold open database work.
 *
 * Running them here keeps the guarantee they exist for (a freshly-deployed
 * instance reconciles its schema before serving) while paying the cost once.
 */
export async function register() {
  // Only the Node.js server runtime can talk to the database; the edge runtime
  // would fail to import pg.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Start sampling pool saturation before the first request, so a spike during
  // startup traffic is captured rather than missed.
  const [{ pool, POOL_MAX }, { attachPoolMetrics }] = await Promise.all([
    import("@/db"),
    import("@/lib/pool-metrics"),
  ]);
  attachPoolMetrics(pool);
  void POOL_MAX;

  const [
    { ensurePrivateTournamentAttendanceSchema },
    { ensureStoreOrderLifecycleSchema },
    { ensureAffiliateSchema },
    { ensurePublicIdentitySeparation },
    { ensureCodArenaSchema },
    { default: logger },
  ] = await Promise.all([
    import("@/lib/private-tournament-attendance"),
    import("@/lib/store-service"),
    import("@/lib/affiliate-service"),
    import("@/lib/public-profile"),
    import("@/lib/cod-room-service"),
    import("@/lib/logger"),
  ]);

  const tasks: Array<[string, () => Promise<unknown>]> = [
    ["privateTournamentAttendance", ensurePrivateTournamentAttendanceSchema],
    ["storeOrderLifecycle", ensureStoreOrderLifecycleSchema],
    ["affiliate", ensureAffiliateSchema],
    ["publicIdentitySeparation", ensurePublicIdentitySeparation],
    ["codArena", ensureCodArenaSchema],
  ];

  // A failure here must not stop the server from booting: the routes that rely
  // on each schema call their own ensure* guard anyway, so a transient database
  // hiccup at boot should degrade, not crash the deploy.
  await Promise.all(
    tasks.map(async ([name, run]) => {
      try {
        await run();
      } catch (error) {
        logger.error({ error, task: name }, "Startup schema reconciliation failed");
      }
    })
  );
}

/**
 * Next calls this for every unhandled error in a route, page or middleware.
 *
 * Previously such an error only surfaced as a stack trace on stdout with no
 * indication of which request produced it. Routing it through the logger means
 * it lands as structured JSON carrying the same requestId as that request's
 * other lines, so the whole failure can be read as one story.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string; headers?: Record<string, string | undefined> },
  context: { routerKind?: string; routePath?: string; routeType?: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { default: logger } = await import("@/lib/logger");
  const { REQUEST_ID_HEADER } = await import("@/lib/request-context");

  logger.error(
    {
      error,
      requestId: request.headers?.[REQUEST_ID_HEADER],
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    "Unhandled request error"
  );
}
