import crypto from "crypto";

/**
 * Session cookies keep the raw random token, but the database only stores this
 * SHA-256 digest. If the sessions table is ever leaked, attackers cannot use
 * the stored value as a bearer token.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function isSha256Hex(value: string | null | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
