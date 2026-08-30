/**
 * Keypad logic for a segmented OTP input.
 *
 * Kept separate from the component so every editing rule -- paste, backspace,
 * overtype, autofill -- is testable without a DOM. The visual half is
 * `OtpCodeInput`.
 */

/** Digits only, capped at `length`. Handles Persian/Arabic-Indic numerals. */
export function normalizeOtpDigits(input: unknown, length: number) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const text = String(input ?? "")
    .split("")
    .map((char) => {
      const p = persian.indexOf(char);
      if (p >= 0) return String(p);
      const a = arabic.indexOf(char);
      if (a >= 0) return String(a);
      return char;
    })
    .join("");
  return text.replace(/\D/g, "").slice(0, Math.max(1, length));
}

export interface OtpEditResult {
  /** The full code after the edit, always `length` characters or fewer. */
  value: string;
  /** Which box should hold focus afterwards. */
  focusIndex: number;
}

/**
 * A character (or a pasted run) typed into box `index`.
 *
 * Typing over a filled box replaces it and moves on; pasting a whole code from
 * any box fills forward from there, which is what SMS autofill produces.
 */
export function applyOtpChange(
  current: string,
  index: number,
  raw: string,
  length: number,
): OtpEditResult {
  const digits = normalizeOtpDigits(raw, length);
  const chars = current.padEnd(length, " ").split("").slice(0, length);

  if (!digits) {
    // A non-digit keystroke must not silently clear the box.
    return { value: current, focusIndex: index };
  }

  // One digit = overtype this box. More than one = an autofill/paste run.
  for (let offset = 0; offset < digits.length && index + offset < length; offset += 1) {
    chars[index + offset] = digits[offset];
  }

  const value = chars.join("").replace(/\s+$/g, "");
  const nextIndex = Math.min(index + digits.length, length - 1);
  return { value, focusIndex: nextIndex };
}

/**
 * Backspace in box `index`.
 *
 * If the box has a digit, clear it and stay. If it is already empty, step back
 * and clear that one -- the behaviour people expect from every OTP field.
 */
export function applyOtpBackspace(current: string, index: number, length: number): OtpEditResult {
  const chars = current.padEnd(length, " ").split("").slice(0, length);
  const hasDigit = /\d/.test(chars[index] || "");

  if (hasDigit) {
    chars[index] = " ";
    return { value: chars.join("").replace(/\s+$/g, ""), focusIndex: index };
  }

  const previous = Math.max(0, index - 1);
  chars[previous] = " ";
  return { value: chars.join("").replace(/\s+$/g, ""), focusIndex: previous };
}

/** Left/right arrows, clamped to the field. RTL is handled by the caller. */
export function clampOtpFocus(index: number, length: number) {
  return Math.min(Math.max(0, index), Math.max(0, length - 1));
}

/** The digit shown in a given box, or "" when it has not been filled yet. */
export function otpDigitAt(value: string, index: number) {
  const char = value[index];
  return char && /\d/.test(char) ? char : "";
}

/** True once every box holds a digit -- the trigger for auto-submit. */
export function isOtpComplete(value: string, length: number) {
  return new RegExp(`^\\d{${length}}$`).test(value);
}
