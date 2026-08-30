import { describe, expect, it } from "vitest";
import { privateCancellationKeepsEntryFee, privateCheckInWindow } from "@/lib/private-tournament-attendance-policy";

describe("private tournament attendance policy", () => {
  const start = "2026-07-20T10:00:00.000Z";

  it("opens check-in 30 minutes before and closes 15 minutes after start", () => {
    const window = privateCheckInWindow(start);
    expect(window.opensAt.toISOString()).toBe("2026-07-20T09:30:00.000Z");
    expect(window.closesAt.toISOString()).toBe("2026-07-20T10:15:00.000Z");
  });

  it("keeps the entry fee only after the check-in window opens", () => {
    expect(privateCancellationKeepsEntryFee(start, new Date("2026-07-20T09:29:59.000Z"))).toBe(false);
    expect(privateCancellationKeepsEntryFee(start, new Date("2026-07-20T09:30:00.000Z"))).toBe(true);
  });
});
