/**
 * Connection-pool visibility.
 *
 * The pool caps at 5 connections in production. Under load the sixth
 * concurrent query waits for a free client and, after
 * connectionTimeoutMillis, fails — but the resulting log only says the query
 * failed. Saturation and a genuine query bug look identical, so the obvious
 * reaction is to go hunting in the wrong place.
 *
 * pg already tracks the numbers needed to tell them apart:
 *   totalCount   - clients open
 *   idleCount    - open and unused
 *   waitingCount - requests queued for a client  <-- saturation signal
 *
 * `waitingCount` above zero means demand is exceeding the pool right now.
 * peakWaiting/acquireTimeouts persist that across the request that observed
 * it, so a spike that has already passed is still visible afterwards.
 */
import type { Pool } from "pg";

export type PoolSnapshot = {
  max: number;
  total: number;
  idle: number;
  waiting: number;
  peakWaiting: number;
  peakTotal: number;
  acquireTimeouts: number;
  /** ok | busy (queue forming) | saturated (queue sustained or timeouts seen) */
  status: "ok" | "busy" | "saturated";
};

let peakWaiting = 0;
let peakTotal = 0;
let acquireTimeouts = 0;
let attached = false;

export function recordAcquireTimeout() {
  acquireTimeouts += 1;
}

/**
 * pg emits no event for "a client was requested", so waitingCount is sampled
 * on pool activity rather than polled on a timer — no background work when the
 * service is idle, which matters on a small instance.
 */
export function attachPoolMetrics(pool: Pool) {
  if (attached) return;
  attached = true;

  const sample = () => {
    if (pool.waitingCount > peakWaiting) peakWaiting = pool.waitingCount;
    if (pool.totalCount > peakTotal) peakTotal = pool.totalCount;
  };

  pool.on("connect", sample);
  pool.on("acquire", sample);
  pool.on("release", sample);
}

export function poolSnapshot(pool: Pool, max: number): PoolSnapshot {
  const waiting = pool.waitingCount;

  const status: PoolSnapshot["status"] =
    acquireTimeouts > 0 || waiting >= max
      ? "saturated"
      : waiting > 0
        ? "busy"
        : "ok";

  return {
    max,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting,
    peakWaiting,
    peakTotal,
    acquireTimeouts,
    status,
  };
}

/** Test helper: metrics are module-level counters. */
export function __resetPoolMetricsForTest() {
  peakWaiting = 0;
  peakTotal = 0;
  acquireTimeouts = 0;
  attached = false;
}
