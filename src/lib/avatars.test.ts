import { describe, expect, it } from "vitest";
import {
  ALLOWED_AVATAR_URLS,
  AVATAR_OPTIONS,
  DEFAULT_AVATAR_URL,
  resolveAvatarUrl,
} from "./avatars";

describe("avatar catalogue", () => {
  it("exposes every option to the server allowlist", () => {
    // The picker and the validator must stay in lockstep: an option the server
    // rejects would save as the default without telling the user why.
    expect(ALLOWED_AVATAR_URLS).toHaveLength(AVATAR_OPTIONS.length);
    for (const option of AVATAR_OPTIONS) {
      expect(ALLOWED_AVATAR_URLS).toContain(option.url);
    }
  });

  it("has no duplicate urls", () => {
    expect(new Set(ALLOWED_AVATAR_URLS).size).toBe(ALLOWED_AVATAR_URLS.length);
  });

  it("has a label for every option", () => {
    for (const option of AVATAR_OPTIONS) {
      expect(option.label.trim()).not.toBe("");
    }
  });

  it("includes the default so a user can return to it", () => {
    expect(ALLOWED_AVATAR_URLS).toContain(DEFAULT_AVATAR_URL);
  });

  it("only serves local paths", () => {
    // A remote URL here would leak every viewer's IP to a third party and
    // could be swapped for different content after review.
    for (const url of ALLOWED_AVATAR_URLS) {
      expect(url.startsWith("/")).toBe(true);
    }
  });
});

describe("resolveAvatarUrl", () => {
  it("accepts a listed avatar", () => {
    expect(resolveAvatarUrl("/avatars/avatar_5.jpg")).toBe("/avatars/avatar_5.jpg");
  });

  it("falls back to the default for an unlisted path", () => {
    expect(resolveAvatarUrl("/avatars/does-not-exist.jpg")).toBe(DEFAULT_AVATAR_URL);
  });

  // avatar_url is rendered into other users' pages, so an arbitrary string
  // would let one account put chosen content in front of everyone else.
  it("rejects a remote url", () => {
    expect(resolveAvatarUrl("https://evil.example/track.jpg")).toBe(DEFAULT_AVATAR_URL);
  });

  it("rejects javascript and data urls", () => {
    expect(resolveAvatarUrl("javascript:alert(1)")).toBe(DEFAULT_AVATAR_URL);
    expect(resolveAvatarUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBe(DEFAULT_AVATAR_URL);
  });

  it("rejects a path traversal attempt", () => {
    expect(resolveAvatarUrl("/avatars/../../etc/passwd")).toBe(DEFAULT_AVATAR_URL);
  });

  it("handles empty, null and non-string input", () => {
    expect(resolveAvatarUrl("")).toBe(DEFAULT_AVATAR_URL);
    expect(resolveAvatarUrl(null)).toBe(DEFAULT_AVATAR_URL);
    expect(resolveAvatarUrl(undefined)).toBe(DEFAULT_AVATAR_URL);
    expect(resolveAvatarUrl({ url: "/avatars/avatar_5.jpg" })).toBe(DEFAULT_AVATAR_URL);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(resolveAvatarUrl("  /avatars/avatar_5.jpg  ")).toBe("/avatars/avatar_5.jpg");
  });
});
