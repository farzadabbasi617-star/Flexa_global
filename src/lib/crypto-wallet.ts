/**
 * Flexa Arena Global - Crypto Wallet & Payment Helper
 * Supports USDT (TRC-20, ERC-20, BEP-20, TON) and TON transfers.
 */

export type CryptoCurrency = "USDT" | "TON" | "XTR" | "USD";

export interface WalletBalance {
  currency: CryptoCurrency;
  amount: number;
  formatted: string;
}

export function validateCryptoAddress(address: string, network: "TRC20" | "ERC20" | "TON"): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();

  if (network === "TRC20") {
    // TRC-20 addresses start with 'T' and are 34 characters long
    return /^T[a-zA-Z0-9]{33}$/.test(trimmed);
  }

  if (network === "ERC20") {
    // Ethereum / EVM hex address (0x + 40 hex chars)
    return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  }

  if (network === "TON") {
    // TON user-friendly bounceable / non-bounceable address (48 chars, base64url)
    return /^[EQEQ-ua-zA-Z0-9_-]{48}$/.test(trimmed) || trimmed.length === 48;
  }

  return false;
}

export function formatCryptoAmount(amount: number, currency: CryptoCurrency = "USDT"): string {
  if (currency === "USD" || currency === "USDT") {
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
  if (currency === "TON") {
    return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} TON`;
  }
  if (currency === "XTR") {
    return `⭐ ${amount.toLocaleString("en-US")} Telegram Stars`;
  }
  return `${amount} ${currency}`;
}

export function calculateTournamentEntryFee(feeInUSDT: number, currency: CryptoCurrency = "USDT"): string {
  if (feeInUSDT <= 0) return "FREE";
  return formatCryptoAmount(feeInUSDT, currency);
}
