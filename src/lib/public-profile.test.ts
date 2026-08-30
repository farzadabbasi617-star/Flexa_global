import { describe, expect, it } from "vitest";
import { initialPublicDisplayName, isLegacyLegalDisplayName } from "./public-profile-policy";

describe("public profile identity separation", () => {
  it("uses the chosen username instead of the legal name for new accounts", () => {
    expect(initialPublicDisplayName("  Farzadov  ")).toBe("Farzadov");
  });

  it("detects the old legal-name display default", () => {
    expect(isLegacyLegalDisplayName("فرزاد عباسی", " فرزاد ", "عباسی")).toBe(true);
  });

  it("does not overwrite a custom gamer name", () => {
    expect(isLegacyLegalDisplayName("Farzadov", "فرزاد", "عباسی")).toBe(false);
  });
});
