import { describe, expect, it } from "vitest";
import {
  applyOtpBackspace,
  applyOtpChange,
  clampOtpFocus,
  isOtpComplete,
  normalizeOtpDigits,
  otpDigitAt,
} from "./otp-input";

describe("normalizeOtpDigits", () => {
  it("keeps digits and drops everything else", () => {
    expect(normalizeOtpDigits("1a2ب3", 6)).toBe("123");
  });

  it("converts Persian numerals, which Iranian keyboards emit by default", () => {
    expect(normalizeOtpDigits("۱۲۳۴۵۶", 6)).toBe("123456");
  });

  it("converts Arabic-Indic numerals too", () => {
    expect(normalizeOtpDigits("٠١٢٣٤٥", 6)).toBe("012345");
  });

  it("never returns more than the field length", () => {
    expect(normalizeOtpDigits("123456789", 4)).toBe("1234");
  });
});

describe("applyOtpChange", () => {
  it("fills the box and advances", () => {
    expect(applyOtpChange("", 0, "7", 6)).toEqual({ value: "7", focusIndex: 1 });
  });

  it("overtypes a filled box instead of appending", () => {
    expect(applyOtpChange("123456", 2, "9", 6)).toEqual({ value: "129456", focusIndex: 3 });
  });

  it("spreads an SMS autofill across the boxes from the first one", () => {
    // This is what a phone's one-time-code suggestion delivers.
    expect(applyOtpChange("", 0, "654321", 6)).toEqual({ value: "654321", focusIndex: 5 });
  });

  it("spreads a paste that starts mid-field without overflowing", () => {
    expect(applyOtpChange("12", 2, "3456789", 6)).toEqual({ value: "123456", focusIndex: 5 });
  });

  it("ignores a non-digit keystroke rather than clearing the box", () => {
    expect(applyOtpChange("1234", 1, "x", 6)).toEqual({ value: "1234", focusIndex: 1 });
  });

  it("stops focus at the last box", () => {
    expect(applyOtpChange("12345", 5, "6", 6).focusIndex).toBe(5);
  });
});

describe("applyOtpBackspace", () => {
  it("clears the current digit and stays put", () => {
    expect(applyOtpBackspace("1234", 3, 6)).toEqual({ value: "123", focusIndex: 3 });
  });

  it("steps back and clears when the box is already empty", () => {
    expect(applyOtpBackspace("123", 3, 6)).toEqual({ value: "12", focusIndex: 2 });
  });

  it("does not walk off the start of the field", () => {
    expect(applyOtpBackspace("", 0, 6)).toEqual({ value: "", focusIndex: 0 });
  });

  it("leaves a hole when clearing a middle box", () => {
    const result = applyOtpBackspace("123456", 2, 6);
    expect(otpDigitAt(result.value, 2)).toBe("");
    expect(otpDigitAt(result.value, 3)).toBe("4");
  });
});

describe("isOtpComplete", () => {
  it("is the auto-submit trigger, so it must not fire early", () => {
    expect(isOtpComplete("12345", 6)).toBe(false);
    expect(isOtpComplete("123456", 6)).toBe(true);
  });

  it("does not treat a code with a gap as complete", () => {
    expect(isOtpComplete("12 456", 6)).toBe(false);
  });

  it("respects a shorter field length", () => {
    expect(isOtpComplete("1234", 4)).toBe(true);
  });
});

describe("clampOtpFocus", () => {
  it("stays inside the field", () => {
    expect(clampOtpFocus(-3, 6)).toBe(0);
    expect(clampOtpFocus(99, 6)).toBe(5);
    expect(clampOtpFocus(2, 6)).toBe(2);
  });
});
