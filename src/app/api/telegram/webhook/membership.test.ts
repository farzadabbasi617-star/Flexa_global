import { describe, it, expect, beforeEach, vi } from "vitest";

const telegramApiMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/telegram", () => ({
  telegramApi: telegramApiMock,
  getTelegramChannelChatId: () => "@Flexa_games",
}));
vi.mock("./settings", () => ({ getTelegramSetting: getSettingMock }));
vi.mock("./transport", () => ({ sendMessage: vi.fn() }));
vi.mock("./config", () => ({ CHANNEL_URL: "https://t.me/Flexa_games" }));
vi.mock("@/lib/telegram-channel", () => ({ channelUrl: () => "https://t.me/Flexa_games" }));
vi.mock("@/lib/logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { checkChannelMembership } from "./membership";

/** Each case uses a fresh telegram id so the module-level cache never bleeds. */
let seq = 0;
const nextId = () => `user-${Date.now()}-${seq++}`;

describe("channel membership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettingMock.mockResolvedValue("true");
  });

  it("admits a real member", async () => {
    telegramApiMock.mockResolvedValue({ ok: true, result: { status: "member" } });
    const check = await checkChannelMembership(nextId());
    expect(check.member).toBe(true);
    expect(check.state).toBe("member");
  });

  it("rejects a genuine non-member", async () => {
    telegramApiMock.mockResolvedValue({ ok: true, result: { status: "left" } });
    const check = await checkChannelMembership(nextId());
    expect(check.member).toBe(false);
    expect(check.state).toBe("not_member");
  });

  // The regression this file exists for: the bot was not a channel admin, so
  // every getChatMember returned 400 and the gate locked out the entire bot.
  it("opens the gate when the bot cannot read the channel (400)", async () => {
    telegramApiMock.mockResolvedValue({
      ok: false,
      error_code: 400,
      description: "Bad Request: chat not found",
    });
    const check = await checkChannelMembership(nextId());
    expect(check.member).toBe(true);
    expect(check.state).toBe("unavailable");
  });

  it("opens the gate when the bot is forbidden from the channel (403)", async () => {
    telegramApiMock.mockResolvedValue({
      ok: false,
      error_code: 403,
      description: "Forbidden: bot is not a member of the channel chat",
    });
    const check = await checkChannelMembership(nextId());
    expect(check.member).toBe(true);
  });

  // Transient failures must still fail closed: retrying those actually works,
  // so opening would hand out a real bypass.
  it("keeps the gate closed on a transient server error (500)", async () => {
    telegramApiMock.mockResolvedValue({
      ok: false,
      error_code: 500,
      description: "Internal Server Error",
    });
    const check = await checkChannelMembership(nextId());
    expect(check.member).toBe(false);
    expect(check.state).toBe("unavailable");
  });

  it("keeps the gate closed when rate limited (429)", async () => {
    telegramApiMock.mockResolvedValue({ ok: false, error_code: 429, description: "Too Many Requests" });
    const check = await checkChannelMembership(nextId());
    expect(check.member).toBe(false);
  });
});
