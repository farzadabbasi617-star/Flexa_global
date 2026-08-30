"use client";

import { useMemo, useState, useEffect } from "react";
import {
  gregorianToJalali,
  isValidJalali,
  jalaliMonthLength,
  jalaliStringToGregorianISO,
  gregorianISOToJalaliString,
  JALALI_MONTHS_FA,
  toFaDigits,
  todayJalali,
} from "@/lib/jalali";

interface Props {
  /** Current value as Gregorian ISO "YYYY-MM-DD" (what we store in the DB). */
  value: string;
  /** Called with the new Gregorian ISO string ("" if the picker is cleared). */
  onChange: (isoGregorian: string) => void;
  /** Youngest allowed birth year (Jalali). Defaults to current year. */
  maxJalaliYear?: number;
  /** Oldest allowed birth year (Jalali). Defaults to 100 years ago. */
  minJalaliYear?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * A dependency-free Jalali (شمسی) date picker built from three <select>
 * dropdowns (day / month / year). Optimised for birth-date entry:
 *
 *   • The DB and every server-side helper still speak Gregorian ISO —
 *     this component converts on the fly using src/lib/jalali.ts.
 *   • Day options automatically shrink for shorter months and non-leap
 *     Esfands (29 days), so users can never pick 31 اسفند 1400.
 *   • Years default to a 100-year window ending at the current Jalali
 *     year, which comfortably covers any adult user.
 *   • Uses native <select> so it's touch-friendly on mobile without
 *     shipping a giant calendar-widget library.
 */
export default function JalaliDatePicker({
  value,
  onChange,
  maxJalaliYear,
  minJalaliYear,
  className = "",
  disabled = false,
}: Props) {
  // Convert the incoming Gregorian ISO to a Jalali {jy, jm, jd} once per
  // change so the three selects always reflect the parent's value.
  const initial = useMemo(() => parseGregorianToJalali(value), [value]);
  const [jy, setJy] = useState<number | "">(initial?.jy ?? "");
  const [jm, setJm] = useState<number | "">(initial?.jm ?? "");
  const [jd, setJd] = useState<number | "">(initial?.jd ?? "");

  // Keep local state in sync if the parent replaces the value externally.
  useEffect(() => {
    setJy(initial?.jy ?? "");
    setJm(initial?.jm ?? "");
    setJd(initial?.jd ?? "");
  }, [initial]);

  const today = useMemo(() => todayJalali(), []);
  const maxYear = maxJalaliYear ?? today.jy;
  const minYear = minJalaliYear ?? maxYear - 100;

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = maxYear; y >= minYear; y -= 1) out.push(y);
    return out;
  }, [maxYear, minYear]);

  const daysInMonth = useMemo(() => {
    if (jy === "" || jm === "") return 31;
    return jalaliMonthLength(Number(jy), Number(jm));
  }, [jy, jm]);

  const days = useMemo(() => {
    const out: number[] = [];
    for (let d = 1; d <= daysInMonth; d += 1) out.push(d);
    return out;
  }, [daysInMonth]);

  // Whenever a complete + valid triple exists, emit the Gregorian ISO up.
  // Clamp day if the user just picked a month that has fewer days than the
  // previously-selected day (e.g. day 31 → month 7 becomes day 30).
  useEffect(() => {
    if (jy === "" || jm === "" || jd === "") {
      // Only clear the parent if it was previously set — avoids an
      // infinite loop when the parent starts empty too.
      if (value) onChange("");
      return;
    }
    const y = Number(jy);
    const m = Number(jm);
    let d = Number(jd);
    const maxD = jalaliMonthLength(y, m);
    if (d > maxD) {
      d = maxD;
      setJd(d);
      return; // useEffect will fire again with the clamped day
    }
    if (!isValidJalali(y, m, d)) return;
    const iso = jalaliStringToGregorianISO(`${y}/${m}/${d}`);
    if (iso && iso !== value) onChange(iso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jy, jm, jd]);

  const readout = useMemo(() => {
    if (!value) return "";
    return gregorianISOToJalaliString(value, { monthName: true, digits: "fa" });
  }, [value]);

  const selectClass =
    "gaming-input text-center px-2 py-2.5 appearance-none bg-dark-800/70 border border-gaming-border rounded-xl font-bold cursor-pointer disabled:opacity-50";

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-2" dir="rtl">
        {/* Year */}
        <select
          className={selectClass}
          value={jy}
          onChange={(e) => setJy(e.target.value ? Number(e.target.value) : "")}
          disabled={disabled}
          aria-label="سال تولد (شمسی)"
        >
          <option value="">سال</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {toFaDigits(y)}
            </option>
          ))}
        </select>

        {/* Month */}
        <select
          className={selectClass}
          value={jm}
          onChange={(e) => setJm(e.target.value ? Number(e.target.value) : "")}
          disabled={disabled}
          aria-label="ماه تولد"
        >
          <option value="">ماه</option>
          {JALALI_MONTHS_FA.slice(1).map((name, idx) => (
            <option key={idx + 1} value={idx + 1}>
              {name}
            </option>
          ))}
        </select>

        {/* Day */}
        <select
          className={selectClass}
          value={jd}
          onChange={(e) => setJd(e.target.value ? Number(e.target.value) : "")}
          disabled={disabled}
          aria-label="روز تولد"
        >
          <option value="">روز</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {toFaDigits(d)}
            </option>
          ))}
        </select>
      </div>

      {readout && (
        <p className="text-[11px] text-gray-400 mt-1.5 leading-5">
          <span className="text-purple-300 font-bold">تاریخ انتخاب‌شده:</span>{" "}
          {readout}
          <span className="text-gray-500"> (میلادی: {value})</span>
        </p>
      )}
    </div>
  );
}

function parseGregorianToJalali(iso: string): { jy: number; jm: number; jd: number } | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return gregorianToJalali(Number(m[1]), Number(m[2]), Number(m[3]));
}
