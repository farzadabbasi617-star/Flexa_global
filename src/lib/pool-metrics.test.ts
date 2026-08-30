import { describe, expect, it, beforeEach } from "vitest";
import type { Pool } from "pg";
import {
  __resetPoolMetricsForTest,
  attachPoolMetrics,
  poolSnapshot,
  recordAcquireTimeout,
} from "./pool-metrics";

/** Minimal stand-in exposing only what poolSnapshot reads. */
function fakePool(counts: { total: number; idle: number; waiting: number }) {
  const handlers: Record<string, Array<() => void>> = {};
  return {
    totalCount: counts.total,
    idleCount: counts.idle,
    waitingCount: counts.waiting,
    on(event: string, fn: () => void) {
      (handlers[event] ||= []).push(fn);
      return this;
    },
    emit(event: string) {
      for (const fn of handlers[event] || []) fn();
    },
  } as unknown as Pool & { emit: (event: string) => void };
}

describe("pool saturation status", () => {
  beforeEach(() => __resetPoolMetricsForTest());

  it("reports ok when nothing is queued", () => {
    const snapshot = poolSnapshot(fakePool({ total: 2, idle: 2, waiting: 0 }), 5);
    expect(snapshot.status).toBe("ok");
  });

  // A queue forming is the earliest warning that the pool is undersized, and
  // it is the signal that distinguishes saturation from a query bug.
  it("reports busy as soon as a request waits", () => {
    const snapshot = poolSnapshot(fakePool({ total: 5, idle: 0, waiting: 1 }), 5);
    expect(snapshot.status).toBe("busy");
  });

  it("reports saturated when the queue reaches the pool size", () => {
    const snapshot = poolSnapshot(fakePool({ total: 5, idle: 0, waiting: 5 }), 5);
    expect(snapshot.status).toBe("saturated");
  });

  // An acquire timeout means a request already failed for lack of a
  // connection, so the pool stays flagged even after the queue drains.
  it("stays saturated after an acquire timeout even once the queue clears", () => {
    recordAcquireTimeout();
    const snapshot = poolSnapshot(fakePool({ total: 1, idle: 1, waiting: 0 }), 5);
    expect(snapshot.status).toBe("saturated");
    expect(snapshot.acquireTimeouts).toBe(1);
  });

  it("remembers the peak queue depth after the spike has passed", () => {
    const pool = fakePool({ total: 5, idle: 0, waiting: 4 });
    attachPoolMetrics(pool);
    pool.emit("acquire");

    (pool as unknown as { waitingCount: number }).waitingCount = 0;
    const snapshot = poolSnapshot(pool, 5);

    expect(snapshot.waiting).toBe(0);
    expect(snapshot.peakWaiting).toBe(4);
  });

  it("reports utilisation against the configured ceiling", () => {
    const snapshot = poolSnapshot(fakePool({ total: 3, idle: 1, waiting: 0 }), 5);
    expect(snapshot.max).toBe(5);
    expect(snapshot.total).toBe(3);
    expect(snapshot.idle).toBe(1);
  });
});
