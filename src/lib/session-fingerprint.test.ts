import { describe, expect, it } from "vitest";
import { isSameDevice, serializeFingerprint, sessionFingerprint } from "./session-fingerprint";

const CHROME_ANDROID_131 =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const CHROME_ANDROID_132 =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.80 Mobile Safari/537.36";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86";

describe("sessionFingerprint", () => {
  it("extracts browser, OS and device class without version noise", () => {
    expect(sessionFingerprint(CHROME_ANDROID_131)).toEqual({
      browser: "chrome",
      os: "android",
      device: "mobile",
    });

    expect(sessionFingerprint(CHROME_WINDOWS)).toEqual({
      browser: "chrome",
      os: "windows",
      device: "desktop",
    });

    expect(sessionFingerprint(SAFARI_IOS)).toEqual({
      browser: "safari",
      os: "ios",
      device: "mobile",
    });
  });

  it("prefers the specific brand over the Chromium/Safari compatibility tokens", () => {
    // Edge advertises both "Chrome/..." and "Safari/..." in its UA string.
    expect(sessionFingerprint(EDGE_WINDOWS).browser).toBe("edge");
  });

  it("serializes to a stable comparable string", () => {
    expect(serializeFingerprint(CHROME_ANDROID_131)).toBe("chrome/android/mobile");
    expect(serializeFingerprint(CHROME_ANDROID_131)).toBe(
      serializeFingerprint(CHROME_ANDROID_132)
    );
  });
});

describe("isSameDevice", () => {
  it("keeps the session alive across a browser version bump", () => {
    // This is the regression that used to log real users out: Chrome rewrites
    // its User-Agent on every self-update.
    expect(isSameDevice(CHROME_ANDROID_131, CHROME_ANDROID_132)).toBe(true);
  });

  it("accepts a byte-identical User-Agent", () => {
    expect(isSameDevice(CHROME_WINDOWS, CHROME_WINDOWS)).toBe(true);
  });

  it("rejects a different browser on the same OS", () => {
    expect(isSameDevice(CHROME_WINDOWS, FIREFOX_WINDOWS)).toBe(false);
    expect(isSameDevice(CHROME_WINDOWS, EDGE_WINDOWS)).toBe(false);
  });

  it("rejects the same browser family on a different OS", () => {
    expect(isSameDevice(CHROME_WINDOWS, CHROME_ANDROID_131)).toBe(false);
  });

  it("rejects a desktop replay of a mobile session", () => {
    expect(isSameDevice(SAFARI_IOS, CHROME_WINDOWS)).toBe(false);
  });

  it("does not destroy sessions when a User-Agent is missing", () => {
    // Legacy rows and non-browser clients must not be punished by a check
    // that has nothing to compare against.
    expect(isSameDevice(null, CHROME_WINDOWS)).toBe(true);
    expect(isSameDevice(CHROME_WINDOWS, null)).toBe(true);
    expect(isSameDevice("", "")).toBe(true);
    expect(isSameDevice("   ", CHROME_WINDOWS)).toBe(true);
  });

  it("allows unrecognised clients through instead of breaking them", () => {
    expect(isSameDevice("SomeCustomEmbeddedWebView/1.0", CHROME_WINDOWS)).toBe(true);
    expect(isSameDevice(CHROME_WINDOWS, "SomeCustomEmbeddedWebView/1.0")).toBe(true);
  });
});
