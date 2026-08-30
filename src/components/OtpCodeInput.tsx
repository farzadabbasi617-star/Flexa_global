"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyOtpBackspace,
  applyOtpChange,
  clampOtpFocus,
  isOtpComplete,
  otpDigitAt,
} from "@/lib/otp-input";

interface OtpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired once, automatically, the moment the last box is filled. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  /** Shakes the boxes red. Reset it to "" to clear. */
  error?: string;
  /** Swaps the field for a success state with an animated tick. */
  verified?: boolean;
  verifiedTitle?: string;
  verifiedSubtitle?: string;
  autoFocus?: boolean;
  label?: string;
}

/**
 * Segmented one-time-code field.
 *
 * Each digit gets its own box, the code verifies itself as soon as it is
 * complete (no "submit" tap), and success replaces the field with a tick
 * instead of a line of text. Modelled on the pattern the user shared.
 *
 * Boxes are laid out LTR even inside an RTL page: a numeric code reads
 * left-to-right everywhere, and mirroring it is a classic RTL bug.
 */
export default function OtpCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  error = "",
  verified = false,
  verifiedTitle = "تأیید شد",
  verifiedSubtitle = "",
  autoFocus = true,
  label,
}: OtpCodeInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);
  // Guards against firing onComplete twice for the same code, which would
  // double-submit the verification request.
  const completedFor = useRef<string | null>(null);

  const focusBox = useCallback((index: number) => {
    const target = inputs.current[clampOtpFocus(index, length)];
    target?.focus();
    target?.select();
  }, [length]);

  useEffect(() => {
    if (autoFocus && !disabled && !verified) focusBox(0);
    // Only on mount: re-focusing on every render would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isOtpComplete(value, length)) {
      completedFor.current = null;
      return;
    }
    if (completedFor.current === value) return;
    completedFor.current = value;
    inputs.current[length - 1]?.blur();
    onComplete?.(value);
  }, [value, length, onComplete]);

  function handleChange(index: number, raw: string) {
    const result = applyOtpChange(value, index, raw, length);
    onChange(result.value);
    if (result.focusIndex !== index) focusBox(result.focusIndex);
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const result = applyOtpBackspace(value, index, length);
      onChange(result.value);
      if (result.focusIndex !== index) focusBox(result.focusIndex);
      return;
    }
    // The boxes render LTR, so ArrowLeft always means "previous box".
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    handleChange(index, event.clipboardData.getData("text"));
  }

  if (verified) {
    return (
      <div className="flex flex-col items-center py-4" dir="rtl">
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="grid h-20 w-20 place-items-center rounded-2xl bg-emerald-500 shadow-[0_0_45px_rgba(16,185,129,0.65)]"
        >
          <motion.svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-11 w-11"
          >
            <motion.path
              d="M4 12.5l5.2 5.2L20 7"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.12, duration: 0.38, ease: "easeOut" }}
            />
          </motion.svg>
        </motion.div>
        <motion.h3
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="mt-5 text-lg font-black text-white"
        >
          {verifiedTitle}
        </motion.h3>
        {verifiedSubtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.38 }}
            className="mt-1.5 text-xs text-gray-400"
          >
            {verifiedSubtitle}
          </motion.p>
        )}
      </div>
    );
  }

  return (
    <div dir="rtl">
      {label && <p className="mb-3 text-center text-xs text-gray-400">{label}</p>}

      <motion.div
        dir="ltr"
        className="flex justify-center gap-2.5 sm:gap-3"
        animate={error ? { x: [0, -9, 9, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.42 }}
      >
        {Array.from({ length }, (_, index) => {
          const digit = otpDigitAt(value, index);
          const isActive = focused === index;
          return (
            <motion.div
              key={index}
              animate={{ scale: isActive ? 1.06 : 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 20 }}
              className="relative"
            >
              <input
                ref={(element) => { inputs.current[index] = element; }}
                type="text"
                inputMode="numeric"
                // Only the first box advertises one-time-code, otherwise some
                // browsers try to autofill the whole code into every box.
                autoComplete={index === 0 ? "one-time-code" : "off"}
                dir="ltr"
                maxLength={length}
                disabled={disabled}
                value={digit}
                onChange={(event) => handleChange(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => handlePaste(index, event)}
                onFocus={() => setFocused(index)}
                onBlur={() => setFocused((prev) => (prev === index ? null : prev))}
                aria-label={`رقم ${index + 1} از ${length}`}
                className={`h-14 w-11 rounded-2xl border-2 bg-black/35 text-center text-2xl font-black text-white outline-none transition-colors sm:h-16 sm:w-13 ${
                  error
                    ? "border-red-500/80"
                    : digit
                      ? "border-neon-purple/70"
                      : isActive
                        ? "border-cyan-400/70"
                        : "border-white/12"
                } disabled:opacity-50`}
              />
              {isActive && !digit && (
                <motion.span
                  layoutId="otp-caret"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-cyan-300"
                  animate={{ opacity: [1, 0.15, 1] }}
                  transition={{ duration: 1.05, repeat: Infinity }}
                />
              )}
            </motion.div>
          );
        })}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-center text-xs font-bold text-red-400"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
