import { describe, expect, it } from "vitest";
import { codRoomReminderBucket, tournamentReminderBucket } from "./route";

/**
 * The cron moved from every 5 minutes to every 30 (Neon's free compute
 * allowance was being burned by keeping the database permanently awake).
 *
 * That change is only safe if every reminder window is at least as wide as the
 * interval between runs. A run observes one instant, so a 17-minute window
 * checked every 30 minutes is a coin flip -- the reminder just silently stops
 * going out, with nothing failing to signal it.
 *
 * These tests assert the property directly: sweep every minute a reminder
 * could be due and confirm no run-aligned gap can skip a bucket.
 */

const CRON_INTERVAL_MIN = 30;

describe("tournamentReminderBucket", () => {
  it("never returns a bucket for a tournament already started", () => {
    expect(tournamentReminderBucket(-1)).toBe(0);
    expect(tournamentReminderBucket(-500)).toBe(0);
  });

  it("maps the imminent window to the 15-minute reminder", () => {
    expect(tournamentReminderBucket(1)).toBe(15);
    expect(tournamentReminderBucket(30)).toBe(15);
  });

  it("maps the hour window to the 60-minute reminder", () => {
    expect(tournamentReminderBucket(31)).toBe(60);
    expect(tournamentReminderBucket(75)).toBe(60);
  });

  it("maps the day window to the 1440-minute reminder", () => {
    expect(tournamentReminderBucket(76)).toBe(1440);
    expect(tournamentReminderBucket(24 * 60)).toBe(1440);
  });

  it("stops reminding beyond a day out", () => {
    expect(tournamentReminderBucket(24 * 60 + 36)).toBe(0);
    expect(tournamentReminderBucket(10_000)).toBe(0);
  });

  // The regression that motivated the change: with the old 0..16 and 17..35
  // windows, a 30-minute cron could step from minute 40 to minute 10 and never
  // observe the 30-minute bucket at all.
  it("every bucket is reachable from some run of a 30-minute cron", () => {
    const seen = new Set<number>();
    // Simulate a tournament starting at T and a cron firing on a fixed phase.
    for (let phase = 0; phase < CRON_INTERVAL_MIN; phase += 1) {
      for (let minutes = 24 * 60 + 40; minutes > 0; minutes -= CRON_INTERVAL_MIN) {
        const offset = minutes - phase;
        if (offset > 0) seen.add(tournamentReminderBucket(offset));
      }
    }
    for (const bucket of [15, 60, 1440]) {
      expect(seen.has(bucket)).toBe(true);
    }
  });

  it("leaves no gap wider than the cron interval between consecutive buckets", () => {
    // Walk the whole range; a bucket must hold for at least CRON_INTERVAL_MIN
    // consecutive minutes or a run can jump over it.
    const runs: Record<number, number> = {};
    for (let m = 1; m <= 24 * 60 + 35; m += 1) {
      runs[tournamentReminderBucket(m)] = (runs[tournamentReminderBucket(m)] || 0) + 1;
    }
    for (const [bucket, width] of Object.entries(runs)) {
      if (bucket === "0") continue;
      expect(width).toBeGreaterThanOrEqual(CRON_INTERVAL_MIN);
    }
  });
});

describe("codRoomReminderBucket", () => {
  it("ignores rooms that already started", () => {
    expect(codRoomReminderBucket(0)).toBe(0);
    expect(codRoomReminderBucket(-10)).toBe(0);
  });

  it("covers the imminent and hour windows", () => {
    expect(codRoomReminderBucket(1)).toBe(15);
    expect(codRoomReminderBucket(30)).toBe(15);
    expect(codRoomReminderBucket(31)).toBe(60);
    expect(codRoomReminderBucket(75)).toBe(60);
  });

  it("stops beyond the hour window", () => {
    expect(codRoomReminderBucket(76)).toBe(0);
  });

  it("leaves no gap wider than the cron interval", () => {
    const runs: Record<number, number> = {};
    for (let m = 1; m <= 75; m += 1) {
      runs[codRoomReminderBucket(m)] = (runs[codRoomReminderBucket(m)] || 0) + 1;
    }
    for (const [bucket, width] of Object.entries(runs)) {
      if (bucket === "0") continue;
      expect(width).toBeGreaterThanOrEqual(CRON_INTERVAL_MIN);
    }
  });
});
