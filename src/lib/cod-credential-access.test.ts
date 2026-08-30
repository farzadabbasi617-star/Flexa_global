import { describe, expect, it } from "vitest";
import { codCredentialDenialMessage, decideCodCredentialAccess } from "./cod-credential-access";

const PAID = "230000";  // 23,000 toman
const FREE = "0";
const REVEAL = new Date("2026-08-01T17:15:00.000Z");
const BEFORE = new Date("2026-08-01T17:00:00.000Z");
const AFTER = new Date("2026-08-01T17:20:00.000Z");

const paidEntry = {
  status: "checked_in",
  checkedInAt: new Date("2026-08-01T16:50:00.000Z"),
  paymentTransactionId: "tx-1",
  paymentMode: "live",
};

const base = { entryFeeRial: PAID, revealAt: REVEAL, status: "check_in" as const };

describe("the paying, checked-in player", () => {
  it("gets the code once the reveal time passes", () => {
    expect(decideCodCredentialAccess({ isPrivileged: false, entry: paidEntry, ...base, now: AFTER }))
      .toEqual({ allowed: true, reason: null });
  });

  it("waits until the reveal time", () => {
    const d = decideCodCredentialAccess({ isPrivileged: false, entry: paidEntry, ...base, now: BEFORE });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("too_early");
  });

  it("gets it immediately once the lobby is open, reveal time or not", () => {
    // At this point the match is starting; withholding the code is useless.
    expect(decideCodCredentialAccess({
      isPrivileged: false, entry: paidEntry, ...base, status: "lobby_open", now: BEFORE,
    }).allowed).toBe(true);
  });
});

describe("everyone who has not paid", () => {
  it("refuses a stranger who never joined", () => {
    expect(decideCodCredentialAccess({ isPrivileged: false, entry: null, ...base, now: AFTER }))
      .toEqual({ allowed: false, reason: "not_registered" });
  });

  it("refuses an entry with no payment transaction on a paid room", () => {
    // This is the case the old gate missed: an entry row created by any path
    // other than joinCodRoom would have passed as "registered".
    const d = decideCodCredentialAccess({
      isPrivileged: false,
      entry: { ...paidEntry, paymentTransactionId: null },
      ...base, now: AFTER,
    });
    expect(d).toEqual({ allowed: false, reason: "not_paid" });
  });

  it("refuses a shadow-mode entry on a paid room", () => {
    // paymentMode "shadow" means the arena was not live, so no money moved.
    expect(decideCodCredentialAccess({
      isPrivileged: false,
      entry: { ...paidEntry, paymentMode: "shadow", paymentTransactionId: null },
      ...base, now: AFTER,
    }).reason).toBe("not_paid");
  });

  it("refuses someone who paid but never checked in", () => {
    expect(decideCodCredentialAccess({
      isPrivileged: false, entry: { ...paidEntry, checkedInAt: null, status: "registered" },
      ...base, now: AFTER,
    }).reason).toBe("not_checked_in");
  });

  it("revokes access from a refunded seat", () => {
    // The row survives for audit, but the person no longer holds a place.
    for (const status of ["refunded", "cancelled"]) {
      expect(decideCodCredentialAccess({
        isPrivileged: false, entry: { ...paidEntry, status }, ...base, now: AFTER,
      }).reason).toBe("entry_not_active");
    }
  });

  it("checks payment before check-in, so the message names the real blocker", () => {
    // Someone who neither paid nor checked in should be told about payment
    // first; telling them to check in would send them down a dead end.
    expect(decideCodCredentialAccess({
      isPrivileged: false,
      entry: { ...paidEntry, checkedInAt: null, paymentTransactionId: null },
      ...base, now: AFTER,
    }).reason).toBe("not_paid");
  });
});

describe("free rooms", () => {
  it("do not demand a payment that was never owed", () => {
    expect(decideCodCredentialAccess({
      isPrivileged: false,
      entry: { ...paidEntry, paymentMode: "shadow", paymentTransactionId: null },
      entryFeeRial: FREE, revealAt: REVEAL, status: "check_in", now: AFTER,
    })).toEqual({ allowed: true, reason: null });
  });

  it("still require check-in", () => {
    expect(decideCodCredentialAccess({
      isPrivileged: false,
      entry: { ...paidEntry, checkedInAt: null, paymentTransactionId: null },
      entryFeeRial: FREE, revealAt: REVEAL, status: "check_in", now: AFTER,
    }).reason).toBe("not_checked_in");
  });
});

describe("staff and admins", () => {
  it("always see the code, since they run the lobby", () => {
    expect(decideCodCredentialAccess({
      isPrivileged: true, entry: null, ...base, now: BEFORE,
    })).toEqual({ allowed: true, reason: null });
  });
});

describe("malformed input is refused, not waved through", () => {
  it("treats an unparseable reveal time as not yet", () => {
    expect(decideCodCredentialAccess({
      isPrivileged: false, entry: paidEntry, ...base,
      revealAt: "not a date", now: AFTER,
    }).reason).toBe("too_early");
  });

  it("treats a missing reveal time as not yet", () => {
    expect(decideCodCredentialAccess({
      isPrivileged: false, entry: paidEntry, ...base, revealAt: null, now: AFTER,
    }).reason).toBe("too_early");
  });

  it("treats an unparseable entry fee as free rather than crashing", () => {
    expect(() => decideCodCredentialAccess({
      isPrivileged: false, entry: paidEntry, ...base,
      entryFeeRial: "not-a-number", now: AFTER,
    })).not.toThrow();
  });
});

describe("denial messages", () => {
  it("tells the player what to do for each reason", () => {
    expect(codCredentialDenialMessage("not_registered")).toContain("ثبت‌نام");
    expect(codCredentialDenialMessage("not_paid")).toContain("پرداخت");
    expect(codCredentialDenialMessage("not_checked_in")).toContain("Check-in");
    expect(codCredentialDenialMessage("too_early")).toContain("زمان");
    expect(codCredentialDenialMessage("entry_not_active")).toContain("بازگردانده");
  });

  it("says nothing when access was granted", () => {
    expect(codCredentialDenialMessage(null)).toBe("");
  });
});
