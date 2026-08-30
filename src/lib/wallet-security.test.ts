import { describe, expect, it } from "vitest";
import {
  WALLET_LIMITS,
  createWalletReference,
  sanitizeWalletNote,
  validateDepositAmountRial,
} from "./wallet-security";

describe("wallet-security", () => {
  it("rejects invalid, too-small and too-large deposit amounts", () => {
    expect(validateDepositAmountRial(BigInt(0)).ok).toBe(false);
    expect(validateDepositAmountRial(WALLET_LIMITS.minDepositRial - BigInt(1)).ok).toBe(false);
    expect(validateDepositAmountRial(WALLET_LIMITS.maxDepositRial + BigInt(1)).ok).toBe(false);
  });

  it("accepts deposit amounts inside the configured safe range", () => {
    expect(validateDepositAmountRial(WALLET_LIMITS.minDepositRial)).toEqual({ ok: true });
    expect(validateDepositAmountRial(BigInt(1_000_000))).toEqual({ ok: true });
    expect(validateDepositAmountRial(WALLET_LIMITS.maxDepositRial)).toEqual({ ok: true });
  });

  it("sanitizes wallet notes before storing them in transaction metadata", () => {
    const note = `  سلام\u0000\nتست  ${"x".repeat(500)}`;
    const sanitized = sanitizeWalletNote(note);

    expect(sanitized).not.toContain("\u0000");
    expect(sanitized).not.toContain("\n");
    expect(sanitized?.length).toBeLessThanOrEqual(WALLET_LIMITS.maxNoteLength);
  });

  it("creates non-guessable unique wallet references", () => {
    const first = createWalletReference("deposit");
    const second = createWalletReference("deposit");

    expect(first).toMatch(/^deposit-\d+-[0-9a-f-]{36}$/);
    expect(second).toMatch(/^deposit-\d+-[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });
});
