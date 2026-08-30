import { describe, expect, it } from "vitest";
import { parseTelegramCommand } from "./command-router";

describe("parseTelegramCommand", () => {
  it("normalizes commands addressed to a bot", () => {
    expect(parseTelegramCommand("/AI@FlexaTournamentBot بهترین دک"))
      .toEqual({ command: "/ai", args: ["بهترین", "دک"] });
  });

  it("parses underscore commands and arguments", () => {
    expect(parseTelegramCommand("  /wallet_deposit 100000 "))
      .toEqual({ command: "/wallet_deposit", args: ["100000"] });
  });

  it("rejects ordinary chat text", () => {
    expect(parseTelegramCommand("سلام")).toBeNull();
  });
});
