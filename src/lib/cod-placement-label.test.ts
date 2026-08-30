import { describe, expect, it } from "vitest";
import { codPlacementLabel } from "./cod-placement-label";

describe("prize table row labels", () => {
  it("names the winning team in a squad room", () => {
    expect(codPlacementLabel(1, 1, "squad")).toBe("جایزه تیم اول");
    expect(codPlacementLabel(2, 2, "squad")).toBe("جایزه تیم دوم");
    expect(codPlacementLabel(3, 3, "duo")).toBe("جایزه تیم سوم");
  });

  it("names the player in a solo room", () => {
    expect(codPlacementLabel(1, 1, "solo")).toBe("جایزه نفر اول");
    expect(codPlacementLabel(4, 4, "solo")).toBe("جایزه نفر چهارم");
  });

  it("phrases a range without repeating the word جایزه", () => {
    // The real BR room pays places 4 through 11 the same amount.
    expect(codPlacementLabel(4, 11, "squad")).toBe("جایزه تیم‌های چهارم تا یازدهم");
    expect(codPlacementLabel(5, 6, "solo")).toBe("جایزه نفرات پنجم تا ششم");
  });

  it("falls back to a numeric ordinal past the written-out range", () => {
    expect(codPlacementLabel(25, 25, "squad")).toBe("جایزه تیم ۲۵اُم");
  });

  it("covers every position the placement rules allow", () => {
    // Placement rules accept 1..100, so no position may produce "undefined".
    for (let position = 1; position <= 100; position += 1) {
      const label = codPlacementLabel(position, position, "squad");
      expect(label.startsWith("جایزه تیم ")).toBe(true);
      expect(label).not.toContain("undefined");
    }
  });
});
