import { describe, expect, it } from "vitest";
import { parseTelegramAdminIds } from "./telegram-admin-ids";

/**
 * Regression tests for the production bug that queued Telegram messages to
 * chat_id 0 every night. The old cron filter was
 * `.filter((id) => Number.isFinite(Number(id)))`, which accepts "" because
 * Number("") === 0. Six outbox rows failed "chat not found" with 5/5 attempts.
 */
describe("parseTelegramAdminIds", () => {
  it("returns nothing for an unset or empty variable", () => {
    expect(parseTelegramAdminIds(undefined)).toEqual([]);
    expect(parseTelegramAdminIds(null)).toEqual([]);
    expect(parseTelegramAdminIds("")).toEqual([]);
    expect(parseTelegramAdminIds("   ")).toEqual([]);
  });

  it("never yields 0 from empty segments -- the actual production bug", () => {
    // Each of these used to survive Number.isFinite(Number(id)) and become 0.
    expect(parseTelegramAdminIds(",")).toEqual([]);
    expect(parseTelegramAdminIds("123,")).toEqual(["123"]);
    expect(parseTelegramAdminIds(",123")).toEqual(["123"]);
    expect(parseTelegramAdminIds("123,,456")).toEqual(["123", "456"]);
    expect(parseTelegramAdminIds("  ,  ")).toEqual([]);
  });

  it("rejects a literal zero", () => {
    expect(parseTelegramAdminIds("0")).toEqual([]);
    expect(parseTelegramAdminIds("0,123")).toEqual(["123"]);
  });

  it("keeps negative ids, which are groups and channels", () => {
    expect(parseTelegramAdminIds("-1001234567890")).toEqual(["-1001234567890"]);
  });

  it("accepts commas, semicolons and whitespace as separators", () => {
    expect(parseTelegramAdminIds("111,222;333 444")).toEqual(["111", "222", "333", "444"]);
    expect(parseTelegramAdminIds(" 111 , 222 ")).toEqual(["111", "222"]);
  });

  it("drops non-numeric junk instead of coercing it", () => {
    // Number("abc") is NaN so this one the old filter did catch, but the
    // replacement must not regress it.
    expect(parseTelegramAdminIds("abc")).toEqual([]);
    expect(parseTelegramAdminIds("12a,34")).toEqual(["34"]);
    expect(parseTelegramAdminIds("1.5")).toEqual([]);
  });
});
