import { normalizeDigits } from "@/lib/phone";

export function parseTomanToRial(value: string | null | undefined): bigint {
  if (!value) return BigInt(0);

  const raw = normalizeDigits(String(value)).trim().toLowerCase();
  if (!raw || raw.includes("رایگان") || raw.includes("free")) return BigInt(0);

  const hasMillion = /میلیون|million|m\b/.test(raw);
  const hasThousand = /هزار|thousand|k\b/.test(raw);
  const hasRial = /USD|rial/.test(raw);

  // Treat comma/Arabic comma/space as thousands separators, so inputs such as
  // 200,000 or ۲۰۰،۰۰۰ are parsed as two hundred thousand, not 200.000.
  const normalizedNumberText = raw.replace(/[،,\s_]/g, "");
  const numericMatches = normalizedNumberText.match(/[0-9]+(?:\.[0-9]+)?/g);
  if (!numericMatches || numericMatches.length === 0) return BigInt(0);

  const firstNumber = Number(numericMatches[0]);
  if (!Number.isFinite(firstNumber) || firstNumber <= 0) return BigInt(0);

  let amount = firstNumber;
  if (hasMillion) amount *= 1_000_000;
  else if (hasThousand) amount *= 1_000;

  // App-facing prices are treated as Toman by default. If explicitly Rial,
  // keep the number in Rial; otherwise convert Toman -> Rial.
  const rial = hasRial ? Math.round(amount) : Math.round(amount * 10);
  return BigInt(rial);
}

export function rialToTomanNumber(rial: bigint) {
  return Number(rial / BigInt(10));
}

export function formatTomanFromRial(rial: bigint) {
  return `${rialToTomanNumber(rial).toLocaleString("fa-IR")} USDT`;
}

export function bigIntFromText(value: string | null | undefined) {
  try {
    return BigInt(value || "0");
  } catch {
    return BigInt(0);
  }
}
