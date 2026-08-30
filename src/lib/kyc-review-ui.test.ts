import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gregorianISOToJalaliString, jalaliStringToGregorianISO } from "@/lib/jalali";
import { KycSubmitSchema } from "./validations";

const read = (p: string) => readFileSync(path.join(process.cwd(), "src", p), "utf8");

/**
 * The seller form used a free-text birth-date box ("مثال: 1375/03/21"), which
 * meant users could type anything and only found out on submit. It now uses
 * the same JalaliDatePicker as registration.
 *
 * The subtlety: that picker emits Gregorian ISO ("1996-06-10"), but KYC stores
 * the Jalali string. The form converts in both directions, so the conversion
 * has to be lossless or a saved date would drift by ~621 years.
 */
describe("seller birth-date picker", () => {
  it("round-trips Jalali -> Gregorian -> Jalali without drift", () => {
    for (const jalali of [
      "1375/03/21",
      "1360/01/01",
      "1399/12/30", // leap Esfand
      "1380/07/15",
      "1350/11/09",
      "1310/06/31", // 31-day month
    ]) {
      const iso = jalaliStringToGregorianISO(jalali);
      expect(iso, `no ISO produced for ${jalali}`).toBeTruthy();

      const back = gregorianISOToJalaliString(iso!, { digits: "latin" });
      const normalised = jalali
        .split("/")
        .map((part, i) => (i === 0 ? part : part.padStart(2, "0")))
        .join("/");
      expect(back, `drift on ${jalali}`).toBe(normalised);
    }
  });

  it("produces a value KYC validation accepts", () => {
    const iso = jalaliStringToGregorianISO("1375/03/21")!;
    const stored = gregorianISOToJalaliString(iso, { digits: "latin" });

    const parsed = KycSubmitSchema.safeParse({
      fullName: "علی رضایی",
      nationalId: "0123456703",
      birthDate: stored,
      idCardImageUrl: "https://res.cloudinary.com/demo/image/upload/id.jpg",
    });
    expect(parsed.success).toBe(true);
  });

  it("uses the picker instead of a free-text box", () => {
    const form = read("app/store/sell/page.tsx");
    expect(form).toContain("JalaliDatePicker");
    // The old placeholder is what users had to decipher.
    expect(form).not.toContain('placeholder="مثال: 1375/03/21"');
  });
});

/**
 * Admins previously saw only a name, a national ID and two bare links, so
 * verifying a seller meant opening the image in another tab and eyeballing it
 * against almost no context.
 */
describe("admin KYC review card", () => {
  const card = read("components/admin/KycReviewCard.tsx");

  it("shows the document inline, not just as a link", () => {
    expect(card).toContain("<img");
    expect(card).toContain("row.idCardImageUrl");
  });

  it("surfaces every field needed to cross-check the document", () => {
    for (const label of [
      "نام کامل (طبق مدرک)",
      "کد ملی",
      "تاریخ تولد",
      "شماره موبایل",
      "ایمیل",
      "شناسه Flexa",
      "تاریخ ارسال مدارک",
      "عضویت در Flexa",
    ]) {
      expect(card, `missing field: ${label}`).toContain(label);
    }
  });

  it("offers a full-screen view, since ID text is unreadable in a thumbnail", () => {
    expect(card).toContain("zoom");
    expect(card).toContain('aria-modal="true"');
  });

  it("renders dates in Jalali for Persian-speaking reviewers", () => {
    expect(card).toContain("gregorianISOToJalaliString");
  });

  it("handles both stored birth-date formats", () => {
    // Newer rows hold a Jalali string; older ones may hold Gregorian ISO.
    // Treating one as the other would show a date ~621 years off.
    expect(card).toMatch(/\\d\{4\}-\\d\{2\}-\\d\{2\}/);
  });

  it("is wired into the admin store page", () => {
    const page = read("app/admin/store/page.tsx");
    expect(page).toContain("KycReviewCard");
    // The old inline markup should be gone.
    expect(page).not.toContain("سلفی (بایگانی)");
  });

  it("is backed by an API that returns the contact fields it displays", () => {
    const route = read("app/api/admin/store/kyc/route.ts");
    for (const field of ["email", "username", "userCreatedAt", "birthDate", "submittedAt"]) {
      expect(route, `API does not return ${field}`).toContain(field);
    }
  });
});
