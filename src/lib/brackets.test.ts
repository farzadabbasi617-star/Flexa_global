import { describe, it, expect } from "vitest";
import { generateSingleEliminationMatches, shuffle } from "@/lib/brackets";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("generateSingleEliminationMatches", () => {
  it("returns no matches for fewer than 2 players", () => {
    expect(generateSingleEliminationMatches([])).toEqual([]);
    expect(generateSingleEliminationMatches(["p1"])).toEqual([]);
  });

  it("creates a single final for 2 players", () => {
    const m = generateSingleEliminationMatches(ids(2));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ round: 1, matchNumber: 1, player1Id: "p1", player2Id: "p2", status: "pending" });
  });

  it("builds 3 rounds for 8 players (4 + 2 + 1 = 7 matches)", () => {
    const m = generateSingleEliminationMatches(ids(8));
    expect(m).toHaveLength(7);
    expect(m.filter((x) => x.round === 1)).toHaveLength(4);
    expect(m.filter((x) => x.round === 2)).toHaveLength(2);
    expect(m.filter((x) => x.round === 3)).toHaveLength(1);
  });

  it("gives the odd player out a bye (auto-completed win) for 5 players", () => {
    const m = generateSingleEliminationMatches(ids(5));
    const round1 = m.filter((x) => x.round === 1);
    expect(round1).toHaveLength(3); // ceil(5/2)
    const byes = round1.filter((x) => x.player2Id === null);
    expect(byes).toHaveLength(1);
    const bye = byes[0];
    expect(bye.status).toBe("completed");
    expect(bye.winnerId).toBe(bye.player1Id); // lone player advances
  });

  it("has no byes when the player count is even", () => {
    const m = generateSingleEliminationMatches(ids(8));
    const round1 = m.filter((x) => x.round === 1);
    expect(round1.every((x) => x.player1Id && x.player2Id)).toBe(true);
    expect(round1.every((x) => x.status === "pending")).toBe(true);
  });

  it("places every registered player exactly once in round 1", () => {
    const players = ids(6);
    const round1 = generateSingleEliminationMatches(players).filter((x) => x.round === 1);
    const placed = round1.flatMap((x) => [x.player1Id, x.player2Id]).filter(Boolean);
    expect(new Set(placed)).toEqual(new Set(players));
  });

  it("leaves later-round matches empty and pending", () => {
    const later = generateSingleEliminationMatches(ids(8)).filter((x) => x.round > 1);
    expect(later.every((x) => x.player1Id === null && x.player2Id === null)).toBe(true);
    expect(later.every((x) => x.status === "pending")).toBe(true);
  });

  it("numbers matches starting at 1 within each round", () => {
    const m = generateSingleEliminationMatches(ids(8));
    const r1 = m.filter((x) => x.round === 1).map((x) => x.matchNumber);
    expect(r1).toEqual([1, 2, 3, 4]);
  });
});

describe("shuffle", () => {
  it("keeps the same elements (a permutation)", () => {
    const input = ids(10);
    const out = shuffle(input);
    expect(out).toHaveLength(input.length);
    expect(new Set(out)).toEqual(new Set(input));
  });

  it("does not mutate the input array", () => {
    const input = ids(5);
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it("is deterministic with a fixed RNG", () => {
    const input = ids(5);
    const rng = () => 0; // always picks index 0 in the swap
    expect(shuffle(input, rng)).toEqual(shuffle(input, rng));
  });
});
