import crypto from "crypto";

export const WALLET_LIMITS = {
  minDepositRial: BigInt(10_000), // 1,000 USDT
  maxDepositRial: BigInt(500_000_000), // 50,000,000 USDT
  maxNoteLength: 300,
} as const;

export function sanitizeWalletNote(value: unknown): string | null {
  const note = String(value ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, "");
  if (!note) return null;
  return note.slice(0, WALLET_LIMITS.maxNoteLength);
}

export function validateDepositAmountRial(amountRial: bigint): { ok: true } | { ok: false; error: string } {
  if (amountRial <= BigInt(0)) {
    return { ok: false, error: "مبلغ شارژ معتبر نیست" };
  }

  if (amountRial < WALLET_LIMITS.minDepositRial) {
    return { ok: false, error: "حداقل مبلغ شارژ ۱٬۰۰۰ USDT است" };
  }

  if (amountRial > WALLET_LIMITS.maxDepositRial) {
    return { ok: false, error: "حداکثر مبلغ هر درخواست شارژ ۵۰٬۰۰۰٬۰۰۰ USDT است" };
  }

  return { ok: true };
}

export function createWalletReference(prefix: "deposit" | "withdrawal" | "admin" | "entry" | "refund" | "prize" = "deposit"): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}
