import crypto from "crypto";
import { normalizeDigits } from "@/lib/phone";
import { GAME_ALIASES, GAME_OPTIONS } from "./config";

export function html(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizeGame(value?: string | null) {
  if (!value) return "";
  const normalized = normalizeDigits(value).trim().toLowerCase().replace(/-/g, "_");
  return GAME_ALIASES[normalized] || GAME_ALIASES[normalized.replace(/_/g, " ")] || normalized;
}

export function gameLabel(gameId?: string) {
  const normalized = normalizeGame(gameId);
  const game = GAME_OPTIONS.find((item) => item.id === normalized);
  return game ? `${game.label} / ${game.fa}` : gameId || "نامشخص";
}

export function gamePrompt(gameId?: string) {
  const normalized = normalizeGame(gameId);
  return GAME_OPTIONS.find((item) => item.id === normalized)?.accountPrompt || "آیدی بازی / گیمرتگ / یوزرنیم داخل بازی را وارد کن:";
}

export function normalizeFlexaId(value: string) {
  return normalizeDigits(value).trim().toUpperCase().replace(/\s+/g, "");
}

export function linkCodeHash(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function generateLinkCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

export function isValidFlexaId(value: string) {
  const normalized = normalizeFlexaId(value);
  if (!normalized.startsWith("FLX-")) return false;
  const suffix = normalized.slice(4);
  return suffix.length >= 4 && suffix.length <= 12 && /^[A-Z0-9-]+$/.test(suffix);
}

export function extractInviteReference(value?: string | null) {
  const input = normalizeDigits(value || "").trim();
  if (!input) return null;
  const match = input.match(/(?:https?:\/\/|clashroyale:\/\/|supercell:\/\/|scid:\/\/)[^\s<>"']+/i);
  const candidate = (match?.[0] || input).trim().replace(/[،,؛;.)\]]+$/g, "");
  if (candidate.length < 4 || candidate.length > 500) return null;
  return candidate;
}

export function isHttpUrl(value?: string | null) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export function splitTelegramText(value: string, maxLength = 2800) {
  const chunks: string[] = [];
  let rest = value.trim();

  while (rest.length > maxLength) {
    const candidate = rest.slice(0, maxLength);
    const breakAt = Math.max(candidate.lastIndexOf("\n"), candidate.lastIndexOf(" "));
    const end = breakAt > maxLength * 0.6 ? breakAt : maxLength;
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}
