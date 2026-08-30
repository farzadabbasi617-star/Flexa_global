import { afterEach, describe, expect, it } from "vitest";
import {
  isValidInviteCode,
  normalizeInviteCode,
  referralShareMessage,
  publicOriginFromHeaders,
  referralWebLink,
  shareTargetUrl,
} from "./referral-invite";

const originalAppUrl = process.env.APP_URL;
afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

describe("normalizeInviteCode", () => {
  it("upper-cases and strips punctuation so a pasted link still resolves", () => {
    expect(normalizeInviteCode(" flx-ab12cd ")).toBe("FLXAB12CD");
  });

  it("caps the length instead of trusting the caller", () => {
    expect(normalizeInviteCode("A".repeat(80))).toHaveLength(24);
  });

  it("returns an empty string for junk", () => {
    expect(normalizeInviteCode("!!!")).toBe("");
    expect(normalizeInviteCode(null)).toBe("");
  });
});

describe("isValidInviteCode", () => {
  it("rejects codes that are too short to be real", () => {
    expect(isValidInviteCode("AB12")).toBe(false);
    expect(isValidInviteCode("ABC123")).toBe(true);
  });
});

describe("referralWebLink", () => {
  it("builds a link that works outside Telegram", () => {
    process.env.APP_URL = "https://www.flexa1.ir";
    expect(referralWebLink("abc123")).toBe("https://www.flexa1.ir/r/ABC123");
  });

  it("never emits a trailing double slash", () => {
    expect(referralWebLink("abc123", "https://www.flexa1.ir/")).toBe("https://www.flexa1.ir/r/ABC123");
  });

  it("returns empty for an unusable code rather than a broken link", () => {
    expect(referralWebLink("")).toBe("");
  });
});

describe("referralShareMessage", () => {
  it("includes the link so a pasted message is self-contained", () => {
    process.env.APP_URL = "https://www.flexa1.ir";
    const message = referralShareMessage({ referralCode: "ABC123" });
    expect(message).toContain("https://www.flexa1.ir/r/ABC123");
    expect(message).toContain("Flexa");
  });
});

describe("publicOriginFromHeaders", () => {
  const headers = (map: Record<string, string>) => ({
    get: (name: string) => map[name.toLowerCase()] ?? null,
  });

  it("uses the forwarded host, not the bind address", () => {
    // Render binds the Node process to localhost:10000; nextUrl.origin returns
    // that and sent every invite click to a dead page in production.
    const origin = publicOriginFromHeaders(headers({
      "x-forwarded-host": "www.flexa1.ir",
      "x-forwarded-proto": "https",
      host: "localhost:10000",
    }));
    expect(origin).toBe("https://www.flexa1.ir");
  });

  it("falls back to APP_URL when the host header is the bind address", () => {
    const origin = publicOriginFromHeaders(headers({ host: "localhost:10000" }), "https://www.flexa1.ir");
    expect(origin).toBe("https://www.flexa1.ir");
  });

  it("never emits a localhost origin", () => {
    expect(publicOriginFromHeaders(headers({ host: "127.0.0.1:3000" }), "https://www.flexa1.ir"))
      .toBe("https://www.flexa1.ir");
  });

  it("takes the first proto when the proxy chains them", () => {
    const origin = publicOriginFromHeaders(headers({
      "x-forwarded-host": "www.flexa1.ir",
      "x-forwarded-proto": "https,http",
    }));
    expect(origin).toBe("https://www.flexa1.ir");
  });

  it("defaults to https when no proto header is present", () => {
    expect(publicOriginFromHeaders(headers({ host: "www.flexa1.ir" }))).toBe("https://www.flexa1.ir");
  });
});

describe("shareTargetUrl", () => {
  it("encodes the message for WhatsApp", () => {
    const url = shareTargetUrl("whatsapp", "سلام دنیا", "https://x.test/r/A");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent("سلام دنیا"));
  });

  it("passes both url and text to Telegram", () => {
    const url = shareTargetUrl("telegram", "متن", "https://x.test/r/A");
    expect(url).toContain(encodeURIComponent("https://x.test/r/A"));
    expect(url).toContain(encodeURIComponent("متن"));
  });
});
