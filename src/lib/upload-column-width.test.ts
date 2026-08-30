import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KycSubmitSchema } from "./validations";

/**
 * Seller verification failed with a generic 500 for every real photo.
 *
 * /api/store/upload falls back to an inline `data:image/...;base64,...` URL
 * when Cloudinary is unconfigured (which is the case in production). Zod
 * accepts those up to 10 MB, but kyc_profiles.id_card_image_url was
 * varchar(500), so Postgres raised:
 *
 *   ERROR: value too long for type character varying(500)
 *
 * It looked fine in testing only because a 1x1 pixel PNG is ~110 characters.
 *
 * The lesson generalises: any column that can receive uploader output must be
 * `text`, because the validation ceiling is orders of magnitude above any
 * varchar cap we would pick.
 */

const SCHEMA = readFileSync(path.join(process.cwd(), "src", "db", "schema.ts"), "utf8");

/** Columns that can hold a value produced by ImageUploader / store upload. */
const UPLOAD_TARGETS = [
  "id_card_image_url",
  "selfie_image_url",
];

function columnDefinition(column: string): string | null {
  // e.g.  idCardImageUrl: text("id_card_image_url").notNull(),
  const match = SCHEMA.match(
    new RegExp(`\\w+:\\s*(\\w+)\\((?:\\s*)"${column}"([^,\\n]*)`, "m")
  );
  return match ? `${match[1]}(${match[2]})` : null;
}

describe("columns that receive uploaded images", () => {
  for (const column of UPLOAD_TARGETS) {
    it(`${column} is text, not a length-capped varchar`, () => {
      const def = columnDefinition(column);
      expect(def, `${column} not found in schema.ts`).not.toBeNull();
      // A base64 data URL for a phone photo is 100KB+; any varchar cap we
      // could pick would be wrong.
      expect(def, `${column} must be text() to hold a base64 data URL`).toMatch(/^text/);
    });
  }
});

describe("KycSubmitSchema", () => {
  const base = {
    fullName: "علی رضایی",
    nationalId: "0123456703",
  };

  it("accepts a base64 data URL the size a real photo produces", () => {
    // ~120KB, the size that used to blow up the insert.
    const dataUrl = `data:image/jpeg;base64,${"A".repeat(120_000)}`;
    const parsed = KycSubmitSchema.safeParse({ ...base, idCardImageUrl: dataUrl });
    expect(parsed.success).toBe(true);
  });

  it("accepts a hosted URL when Cloudinary is configured", () => {
    const parsed = KycSubmitSchema.safeParse({
      ...base,
      idCardImageUrl: "https://res.cloudinary.com/demo/image/upload/id.jpg",
    });
    expect(parsed.success).toBe(true);
  });

  it("still rejects a value that is not an image reference at all", () => {
    for (const bad of ["", "not-a-url", "javascript:alert(1)", "ftp://x/y.png"]) {
      const parsed = KycSubmitSchema.safeParse({ ...base, idCardImageUrl: bad });
      expect(parsed.success, `should reject: ${bad}`).toBe(false);
    }
  });

  it("keeps a ceiling so an unbounded payload cannot be stored", () => {
    const huge = `data:image/jpeg;base64,${"A".repeat(11_000_000)}`;
    expect(KycSubmitSchema.safeParse({ ...base, idCardImageUrl: huge }).success).toBe(false);
  });
});

describe("KYC route error handling", () => {
  it("maps a length-overflow to an actionable message instead of a blank 500", () => {
    const route = readFileSync(
      path.join(process.cwd(), "src", "app", "api", "kyc", "route.ts"),
      "utf8"
    );
    // 22001 = string_data_right_truncation
    expect(route).toContain('"22001"');
    expect(route).toContain("حجم تصویر");
  });
});
