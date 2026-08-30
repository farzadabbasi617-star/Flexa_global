import { describe, expect, it } from "vitest";
import { isSupportedClashInvite } from "./clash-1v1-policy";

describe("Clash 1V1 friend-share link validation", () => {
  it("accepts official Clash Royale friend share links", () => {
    expect(isSupportedClashInvite(
      "https://link.clashroyale.com/invite/friend/en?tag=%23ABC123&token=abc-XYZ_123&platform=android",
    )).toBe(true);
  });

  it("rejects official links that are not complete friend invitations", () => {
    expect(isSupportedClashInvite("https://link.clashroyale.com/invite/friend/en?tag=ABC")).toBe(false);
    expect(isSupportedClashInvite("https://link.clashroyale.com/invite/friend/en?token=XYZ")).toBe(false);
    expect(isSupportedClashInvite("https://link.clashroyale.com/deck/en?deck=123")).toBe(false);
    expect(isSupportedClashInvite("https://link.supercell.com/invite/friend/en?tag=ABC&token=XYZ")).toBe(false);
  });

  it("rejects app schemes, phishing domains, and insecure links", () => {
    expect(isSupportedClashInvite("clashroyale://invite/friend/test")).toBe(false);
    expect(isSupportedClashInvite("https://clashroyale.example.com/invite/friend/en?tag=ABC&token=XYZ")).toBe(false);
    expect(isSupportedClashInvite("http://link.clashroyale.com/invite/friend/en?tag=ABC&token=XYZ")).toBe(false);
    expect(isSupportedClashInvite("https://evil.example/qr")).toBe(false);
  });
});
