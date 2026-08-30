import { describe, expect, it } from "vitest";
import { requestsPerHour, shouldPoll, shouldRefreshOnVisibilityChange } from "./poll-scheduler";

describe("when the notification poller runs", () => {
  it("polls for a signed-in user looking at the tab", () => {
    expect(shouldPoll({ signedIn: true, visible: true })).toBe(true);
  });

  it("never polls for a signed-out visitor", () => {
    // An anonymous visitor has no notifications; polling for them is pure waste.
    expect(shouldPoll({ signedIn: false, visible: true })).toBe(false);
    expect(shouldPoll({ signedIn: false, visible: false })).toBe(false);
  });

  it("stops while the tab is hidden", () => {
    // A phone left on a backgrounded tab was still issuing a request a minute.
    expect(shouldPoll({ signedIn: true, visible: false })).toBe(false);
  });
});

describe("returning to the tab", () => {
  it("refreshes immediately rather than waiting out the interval", () => {
    expect(shouldRefreshOnVisibilityChange(
      { signedIn: true, visible: false },
      { signedIn: true, visible: true },
    )).toBe(true);
  });

  it("does not refresh when the tab was already visible", () => {
    expect(shouldRefreshOnVisibilityChange(
      { signedIn: true, visible: true },
      { signedIn: true, visible: true },
    )).toBe(false);
  });

  it("does not refresh on the way out", () => {
    expect(shouldRefreshOnVisibilityChange(
      { signedIn: true, visible: true },
      { signedIn: true, visible: false },
    )).toBe(false);
  });

  it("does not refresh for a signed-out visitor", () => {
    expect(shouldRefreshOnVisibilityChange(
      { signedIn: false, visible: false },
      { signedIn: false, visible: true },
    )).toBe(false);
  });
});

describe("request volume during a full room", () => {
  const MINUTE = 60_000;

  it("halves once the duplicate poller is removed", () => {
    // Navbar and BottomNav both render on every page and each owned a timer.
    expect(requestsPerHour(MINUTE, 2)).toBe(120);
    expect(requestsPerHour(MINUTE, 1)).toBe(60);
  });

  it("scales to a real 100-player room", () => {
    const before = requestsPerHour(MINUTE, 2) * 100;
    const after = requestsPerHour(MINUTE, 1) * 100;
    expect(before).toBe(12_000);
    expect(after).toBe(6_000);
  });

  it("treats a disabled interval as no traffic", () => {
    expect(requestsPerHour(0)).toBe(0);
  });
});
