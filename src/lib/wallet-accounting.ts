import { bigIntFromText, rialToTomanNumber } from "@/lib/money";

export type WalletTxLike = {
  amount: string;
  type: string;
  status: string;
  metadata?: unknown;
};

function metadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

export function isWithdrawableCredit(tx: WalletTxLike) {
  if (tx.status !== "completed") return false;
  const meta = metadataObject(tx.metadata);
  if (meta.withdrawable === false) return false;
  return tx.type === "tournament_win" || tx.type === "refund";
}

export function calculateWithdrawableRial(transactions: WalletTxLike[]) {
  let credits = BigInt(0);
  let reservedOrPaid = BigInt(0);

  for (const tx of transactions) {
    const amount = bigIntFromText(tx.amount);
    if (isWithdrawableCredit(tx)) credits += amount;
    if (tx.type === "withdrawal" && (tx.status === "pending" || tx.status === "completed")) {
      reservedOrPaid += amount;
    }
  }

  const available = credits - reservedOrPaid;
  return available > BigInt(0) ? available : BigInt(0);
}

export function walletBreakdown(balanceRial: bigint, transactions: WalletTxLike[]) {
  const withdrawableRial = calculateWithdrawableRial(transactions);
  const nonWithdrawableRial = balanceRial > withdrawableRial ? balanceRial - withdrawableRial : BigInt(0);

  return {
    totalRial: balanceRial.toString(),
    totalToman: rialToTomanNumber(balanceRial),
    usableRial: balanceRial.toString(),
    usableToman: rialToTomanNumber(balanceRial),
    withdrawableRial: withdrawableRial.toString(),
    withdrawableToman: rialToTomanNumber(withdrawableRial),
    nonWithdrawableRial: nonWithdrawableRial.toString(),
    nonWithdrawableToman: rialToTomanNumber(nonWithdrawableRial),
  };
}

export function sanitizeIban(value: unknown) {
  const raw = String(value ?? "").trim().replace(/\s|-/g, "").toUpperCase();
  if (!raw) return "";
  return raw.startsWith("IR") ? raw : `IR${raw}`;
}

export function isValidIranIban(value: string) {
  return /^IR\d{24}$/.test(value);
}

export function sanitizeNationalId(value: unknown) {
  return String(value ?? "").trim().replace(/\D/g, "").slice(0, 10);
}

export function sanitizeShortText(value: unknown, max = 120) {
  return String(value ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max);
}
