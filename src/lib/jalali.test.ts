import { describe, it, expect } from "vitest";
import {
  gregorianISOToJalaliString,
  gregorianToJalali,
  isJalaliLeap,
  isValidJalali,
  jalaliMonthLength,
  jalaliStringToGregorianISO,
  jalaliToGregorian,
  parseJalaliString,
  toEnDigits,
  toFaDigits,
} from "./jalali";

describe("digit helpers", () => {
  it("converts latin → Persian digits", () => {
    expect(toFaDigits("2026-07-08")).toBe("۲۰۲۶-۰۷-۰۸");
    expect(toFaDigits(1400)).toBe("۱۴۰۰");
  });
  it("converts Persian → latin digits", () => {
    expect(toEnDigits("۱۳۸۰/۰۳/۲۱")).toBe("1380/03/21");
  });
  it("handles Arabic-Indic digits pasted from Arabic keyboards", () => {
    expect(toEnDigits("١٤٠٠")).toBe("1400");
  });
});

describe("gregorianToJalali / jalaliToGregorian (round-trip)", () => {
  const known: Array<[string, string]> = [
    // Gregorian ISO, Jalali "jy/jm/jd"
    ["2001-03-21", "1380/01/01"], // Nowruz 1380
    ["2000-05-14", "1379/02/25"],
    ["1990-01-01", "1368/10/11"],
    ["2026-07-08", "1405/04/17"], // today (fixed reference)
    ["2024-03-19", "1402/12/29"], // last day of 1402
    ["2024-03-20", "1403/01/01"], // Nowruz 1403
    ["2025-03-20", "1403/12/30"], // last day of 1403 (leap year in Jalali)
    ["2025-03-21", "1404/01/01"], // Nowruz 1404
  ];

  for (const [greg, jalali] of known) {
    it(`converts ${greg} ↔ ${jalali}`, () => {
      const [gy, gm, gd] = greg.split("-").map(Number);
      const j = gregorianToJalali(gy, gm, gd);
      const [jy, jm, jd] = jalali.split("/").map(Number);
      expect(j).toEqual({ jy, jm, jd });

      const g = jalaliToGregorian(jy, jm, jd);
      expect(g).toEqual({ gy, gm, gd });
    });
  }
});

describe("jalaliMonthLength", () => {
  it("gives 31 days for months 1..6", () => {
    for (let m = 1; m <= 6; m += 1) expect(jalaliMonthLength(1400, m)).toBe(31);
  });
  it("gives 30 days for months 7..11", () => {
    for (let m = 7; m <= 11; m += 1) expect(jalaliMonthLength(1400, m)).toBe(30);
  });
  it("Esfand (12) is 29 days in non-leap years and 30 in leap years", () => {
    // 1403 is a Jalali leap year (Gregorian 2024-03-20 → 2025-03-20)
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    // 1400 is NOT a leap year in Jalali
    expect(jalaliMonthLength(1400, 12)).toBe(29);
  });
});

describe("isJalaliLeap", () => {
  it("recognises known leap years", () => {
    expect(isJalaliLeap(1403)).toBe(true);
    expect(isJalaliLeap(1399)).toBe(true);
  });
  it("recognises known common years", () => {
    expect(isJalaliLeap(1400)).toBe(false);
    expect(isJalaliLeap(1402)).toBe(false);
  });
});

describe("isValidJalali", () => {
  it("accepts valid dates", () => {
    expect(isValidJalali(1400, 1, 1)).toBe(true);
    expect(isValidJalali(1400, 12, 29)).toBe(true);
    expect(isValidJalali(1403, 12, 30)).toBe(true);
  });
  it("rejects invalid month/day combinations", () => {
    expect(isValidJalali(1400, 12, 30)).toBe(false); // 1400 non-leap
    expect(isValidJalali(1400, 7, 31)).toBe(false); // Mehr has 30
    expect(isValidJalali(1400, 13, 1)).toBe(false);
    expect(isValidJalali(1400, 0, 1)).toBe(false);
    expect(isValidJalali(1400, 1, 0)).toBe(false);
    expect(isValidJalali(1400, 1, 32)).toBe(false);
  });
  it("rejects out-of-range years", () => {
    expect(isValidJalali(1100, 1, 1)).toBe(false);
    expect(isValidJalali(1700, 1, 1)).toBe(false);
  });
});

describe("parseJalaliString", () => {
  it("parses YYYY/MM/DD", () => {
    expect(parseJalaliString("1380/03/21")).toEqual({ jy: 1380, jm: 3, jd: 21 });
  });
  it("parses YYYY-M-D loose form", () => {
    expect(parseJalaliString("1380-3-1")).toEqual({ jy: 1380, jm: 3, jd: 1 });
  });
  it("parses Persian digits", () => {
    expect(parseJalaliString("۱۳۸۰/۰۳/۲۱")).toEqual({ jy: 1380, jm: 3, jd: 21 });
  });
  it("returns null for garbage", () => {
    expect(parseJalaliString("hello")).toBeNull();
    expect(parseJalaliString("")).toBeNull();
    expect(parseJalaliString(null)).toBeNull();
    expect(parseJalaliString(undefined)).toBeNull();
    expect(parseJalaliString("1400/13/01")).toBeNull(); // invalid month
    expect(parseJalaliString("1400/12/30")).toBeNull(); // Esfand 30 in non-leap
  });
});

describe("jalaliStringToGregorianISO", () => {
  it("converts a valid Jalali string to Gregorian ISO", () => {
    expect(jalaliStringToGregorianISO("1380/01/01")).toBe("2001-03-21");
    expect(jalaliStringToGregorianISO("۱۴۰۳/۰۱/۰۱")).toBe("2024-03-20");
  });
  it("returns null for invalid input", () => {
    expect(jalaliStringToGregorianISO("nope")).toBeNull();
    expect(jalaliStringToGregorianISO("")).toBeNull();
  });
});

describe("gregorianISOToJalaliString", () => {
  it("formats with Persian digits by default", () => {
    expect(gregorianISOToJalaliString("2001-03-21")).toBe("۱۳۸۰/۰۱/۰۱");
  });
  it("supports Latin digits", () => {
    expect(gregorianISOToJalaliString("2001-03-21", { digits: "latin" })).toBe("1380/01/01");
  });
  it("supports the month-name format", () => {
    expect(gregorianISOToJalaliString("2001-03-21", { monthName: true })).toBe(
      "۱ فروردین ۱۳۸۰"
    );
  });
  it("returns empty string for missing/invalid input", () => {
    expect(gregorianISOToJalaliString(null)).toBe("");
    expect(gregorianISOToJalaliString("nope")).toBe("");
  });
});
