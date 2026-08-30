import { describe, expect, it } from "vitest";
import {
  CLASH_PRIVATE_DRAFT_CATEGORY,
  CLASH_PRIVATE_DRAFT_MODE,
  normalizeClashPrivateDraftSettings,
} from "@/lib/clash-private-tournament";

describe("Clash Royale private Draft tournament settings", () => {
  it("locks the game capacity and applies fair-play defaults", () => {
    const result = normalizeClashPrivateDraftSettings({
      game: "clash_royale",
      categoryLabel: CLASH_PRIVATE_DRAFT_CATEGORY,
      maxPlayers: 50,
      serverSlots: 10,
    });
    expect(result.maxPlayers).toBe(50);
    expect(result.serverSlots).toBe(50);
    expect(result.format).toBe("round_robin");
    expect(result.gameMode).toBe(CLASH_PRIVATE_DRAFT_MODE);
    expect(result.winnersCount).toBe(3);
    expect(result.rules).toContain("Tournament Standard");
  });

  it("rejects capacities that Clash Royale private tournaments do not support", () => {
    expect(() => normalizeClashPrivateDraftSettings({
      game: "clash_royale",
      categoryLabel: CLASH_PRIVATE_DRAFT_CATEGORY,
      maxPlayers: 32,
    })).toThrow(/۱۰، ۵۰، ۱۰۰ یا ۲۰۰/);
  });

  it("does not modify unrelated tournament modes", () => {
    const input = { game: "clash_royale", categoryLabel: "clash_1v1_queue", maxPlayers: 32 };
    expect(normalizeClashPrivateDraftSettings(input)).toBe(input);
  });
});
