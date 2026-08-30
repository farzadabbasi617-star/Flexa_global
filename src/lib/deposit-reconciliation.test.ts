import { describe, expect, it } from "vitest";
import { decideReconciliation } from "./deposit-reconciliation";

/**
 * These rules decide whether real money moves, so the bias is explicit:
 * when anything is uncertain the answer must be "wait". Closing a row that was
 * actually paid loses the user's money silently, which is exactly the failure
 * this module exists to end.
 */

const now = new Date("2026-08-20T12:00:00Z");
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3_600_000);

describe("decideReconciliation", () => {
  it("credits a payment the gateway confirms was paid", () => {
    expect(
      decideReconciliation({
        hasAuthority: true,
        inquiryOk: true,
        paid: true,
        createdAt: minutesAgo(30),
        now,
      })
    ).toBe("credit");
  });

  it("credits a paid payment regardless of age", () => {
    // An old row that was genuinely paid is the worst case -- the user has been
    // waiting the longest. Age must never downgrade a confirmed payment.
    expect(
      decideReconciliation({
        hasAuthority: true,
        inquiryOk: true,
        paid: true,
        createdAt: hoursAgo(500),
        now,
      })
    ).toBe("credit");
  });

  it("waits when the gateway did not answer, even for an old row", () => {
    // A failed inquiry says nothing about whether money moved. Closing here
    // would be a guess with someone else's money.
    expect(
      decideReconciliation({
        hasAuthority: true,
        inquiryOk: false,
        paid: false,
        createdAt: hoursAgo(500),
        now,
      })
    ).toBe("wait");
  });

  it("waits on an unpaid row that is still inside the window", () => {
    expect(
      decideReconciliation({
        hasAuthority: true,
        inquiryOk: true,
        paid: false,
        createdAt: hoursAgo(1),
        now,
      })
    ).toBe("wait");
  });

  it("closes an unpaid row once the gateway window has clearly passed", () => {
    expect(
      decideReconciliation({
        hasAuthority: true,
        inquiryOk: true,
        paid: false,
        createdAt: hoursAgo(73),
        now,
      })
    ).toBe("close");
  });

  it("does not close exactly at the boundary minus a moment", () => {
    expect(
      decideReconciliation({
        hasAuthority: true,
        inquiryOk: true,
        paid: false,
        createdAt: hoursAgo(71.9),
        now,
      })
    ).toBe("wait");
  });

  it("reports a row that never reached the gateway", () => {
    // No authority means no payment was ever started, so there is nothing to
    // ask about and nothing to credit.
    expect(
      decideReconciliation({
        hasAuthority: false,
        inquiryOk: false,
        paid: false,
        createdAt: hoursAgo(500),
        now,
      })
    ).toBe("no_authority");
  });

  it("waits when the row has no creation timestamp", () => {
    expect(
      decideReconciliation({
        hasAuthority: true,
        inquiryOk: true,
        paid: false,
        createdAt: null,
        now,
      })
    ).toBe("wait");
  });
});
