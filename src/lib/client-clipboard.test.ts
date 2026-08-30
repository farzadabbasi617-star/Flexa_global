import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextSafely } from "./client-clipboard";

describe("copyTextSafely", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the modern Clipboard API when the WebView permits it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyTextSafely("https://example.com/ref")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://example.com/ref");
  });

  it("falls back to a selected textarea when Telegram rejects Clipboard API", async () => {
    const remove = vi.fn();
    const textarea = {
      value: "",
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      remove,
    };
    const appendChild = vi.fn();
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => textarea),
      body: { appendChild },
      execCommand: vi.fn(() => true),
    });
    expect(await copyTextSafely("referral-link")).toBe(true);
    expect(textarea.value).toBe("referral-link");
    expect(appendChild).toHaveBeenCalledWith(textarea);
    expect(remove).toHaveBeenCalled();
  });

  it("fails safely for an empty value", async () => {
    expect(await copyTextSafely("")).toBe(false);
  });
});
