import { describe, expect, it } from "vitest";
import {
  canBotVerifyTelegramMembership,
  isActiveTelegramChannelMember,
} from "./telegram-membership-policy";

describe("Telegram channel membership policy", () => {
  it.each(["creator", "administrator", "member"])("accepts active %s status", (status) => {
    expect(isActiveTelegramChannelMember({ status })).toBe(true);
  });

  it("accepts restricted users only when Telegram says they are still members", () => {
    expect(isActiveTelegramChannelMember({ status: "restricted", is_member: true })).toBe(true);
    expect(isActiveTelegramChannelMember({ status: "restricted", is_member: false })).toBe(false);
  });

  it.each(["left", "kicked", "banned"])("rejects inactive %s status", (status) => {
    expect(isActiveTelegramChannelMember({ status })).toBe(false);
  });

  it("requires bot administrator rights for reliable verification", () => {
    expect(canBotVerifyTelegramMembership({ status: "administrator" })).toBe(true);
    expect(canBotVerifyTelegramMembership({ status: "member" })).toBe(false);
    expect(canBotVerifyTelegramMembership(undefined)).toBe(false);
  });
});
