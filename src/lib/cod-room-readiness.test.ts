import { describe, expect, it } from "vitest";
import {
  codReadinessBlockers,
  evaluateCodRoomReadiness,
  isCodRoomPublishable,
} from "./cod-room-readiness";

const future = new Date(Date.now() + 48 * 60 * 60_000);
const reveal = new Date(future.getTime() - 15 * 60_000);

/** A paid room with everything an operator needs to actually run it. */
const runnable = {
  status: "registration",
  isPublished: true,
  roomCode: "GAMENT01",
  roomPassword: "1234",
  officialJoinUrl: null,
  bannerImageUrl: "/cod/banner-isolated-br.jpg",
  faq: [{ question: "q", answer: "a" }],
  rules: "قوانین روم",
  hasRoomer: true,
  startsAt: future,
  credentialsRevealAt: reveal,
  entryFeeRial: "230000",
  hasAnyReward: true,
};

describe("a runnable paid room", () => {
  it("publishes cleanly", () => {
    expect(evaluateCodRoomReadiness(runnable)).toEqual([]);
    expect(isCodRoomPublishable(runnable)).toBe(true);
  });

  it("accepts an official invite link instead of a room code", () => {
    const viaInvite = {
      ...runnable,
      roomCode: null,
      roomPassword: null,
      officialJoinUrl: "https://www.callofduty.com/cdn/codm/teaminvite/x.html?room=1",
    };
    expect(codReadinessBlockers(evaluateCodRoomReadiness(viaInvite))).toEqual([]);
  });
});

describe("blockers on a paid room", () => {
  const blockerKeys = (input: Parameters<typeof evaluateCodRoomReadiness>[0]) =>
    codReadinessBlockers(evaluateCodRoomReadiness(input)).map((issue) => issue.key);

  it("refuses a room nobody can enter", () => {
    // This is the exact state BR-ISO-001 was left in: no code, no invite link.
    expect(blockerKeys({ ...runnable, roomCode: null, officialJoinUrl: null })).toContain("credentials");
    expect(isCodRoomPublishable({ ...runnable, roomCode: null, officialJoinUrl: null })).toBe(false);
  });

  it("rejects a non-official invite link as if it were absent", () => {
    expect(blockerKeys({ ...runnable, roomCode: null, officialJoinUrl: "https://evil.example.com/join" }))
      .toContain("credentials");
  });

  it("refuses a room with nobody assigned to host it", () => {
    expect(blockerKeys({ ...runnable, hasRoomer: false })).toContain("roomer");
  });

  it("refuses a paid room with no prize configured", () => {
    expect(blockerKeys({ ...runnable, hasAnyReward: false })).toContain("rewards");
  });

  it("refuses to reveal the room code after the match has started", () => {
    const late = new Date(future.getTime() + 10 * 60_000);
    expect(blockerKeys({ ...runnable, credentialsRevealAt: late })).toContain("reveal_after_start");
  });

  it("refuses a start time in the past", () => {
    const past = new Date(Date.now() - 60_000);
    expect(blockerKeys({ ...runnable, startsAt: past, credentialsRevealAt: past }))
      .toContain("start_in_past");
  });

  it("reports every blocker at once rather than one at a time", () => {
    const keys = blockerKeys({
      ...runnable, roomCode: null, officialJoinUrl: null, hasRoomer: false, hasAnyReward: false,
    });
    expect(keys.sort()).toEqual(["credentials", "rewards", "roomer"]);
  });
});

describe("free rooms are held to a softer standard", () => {
  const free = { ...runnable, entryFeeRial: "0" };

  it("lets a free room publish without credentials or a host", () => {
    // Nobody has paid, so an incomplete free room costs players nothing.
    const issues = evaluateCodRoomReadiness({
      ...free, roomCode: null, officialJoinUrl: null, hasRoomer: false, hasAnyReward: false,
    });
    expect(codReadinessBlockers(issues)).toEqual([]);
    expect(issues.map((issue) => issue.key).sort()).toEqual(["credentials", "rewards", "roomer"]);
  });

  it("still blocks a free room whose schedule is impossible", () => {
    const late = new Date(future.getTime() + 10 * 60_000);
    expect(codReadinessBlockers(evaluateCodRoomReadiness({ ...free, credentialsRevealAt: late })))
      .toHaveLength(1);
  });
});

describe("warnings that do not stop publication", () => {
  it("nags about a missing password, FAQ, rules and banner", () => {
    const issues = evaluateCodRoomReadiness({
      ...runnable, roomPassword: null, faq: [], rules: "", bannerImageUrl: null,
    });
    expect(codReadinessBlockers(issues)).toEqual([]);
    expect(issues.map((issue) => issue.key).sort()).toEqual(["banner", "faq", "password", "rules"]);
  });

  it("does not warn about a password when entry is via an invite link", () => {
    const issues = evaluateCodRoomReadiness({
      ...runnable,
      roomCode: null,
      roomPassword: null,
      officialJoinUrl: "https://www.callofduty.com/cdn/codm/teaminvite/x.html?room=1",
    });
    expect(issues.map((issue) => issue.key)).not.toContain("password");
  });
});

describe("a room created by a single admin", () => {
  it("counts its creator as the roomer so publishing is not deadlocked", () => {
    // createCodRoom assigns the creator as roomer. Before that, a solo operator
    // was told to assign a roomer from a form only reachable after the room
    // already existed -- an instruction they could not follow.
    const asCreated = { ...runnable, hasRoomer: true };
    expect(codReadinessBlockers(evaluateCodRoomReadiness(asCreated))).toEqual([]);
  });
});
