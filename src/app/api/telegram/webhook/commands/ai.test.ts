import { describe, expect, it } from "vitest";
import { splitTelegramText } from "../utils";

describe("splitTelegramText", () => {
  it("keeps short responses in one message", () => {
    expect(splitTelegramText("سلام قهرمان", 100)).toEqual(["سلام قهرمان"]);
  });

  it("splits long text without losing content", () => {
    const input = "one two three four five six seven eight nine ten";
    const chunks = splitTelegramText(input, 15);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(input);
    expect(chunks.every((chunk) => chunk.length <= 15)).toBe(true);
  });
});
