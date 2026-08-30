import { describe, expect, it } from "vitest";
import { hashSessionToken, isSha256Hex } from "./session-token";

describe("session-token", () => {
  it("stores only a stable SHA-256 digest, not the bearer token", () => {
    const token = "raw-session-token-that-would-be-in-the-cookie";
    const hash = hashSessionToken(token);

    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
    expect(isSha256Hex(hash)).toBe(true);
    expect(hashSessionToken(token)).toBe(hash);
  });

  it("changes the digest when the token changes", () => {
    expect(hashSessionToken("token-a")).not.toBe(hashSessionToken("token-b"));
  });
});
