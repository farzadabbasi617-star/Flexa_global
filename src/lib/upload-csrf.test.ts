import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KycSubmitSchema } from "./validations";

/**
 * validateSession() rejects any POST/PATCH/PUT/DELETE that arrives without an
 * `X-Requested-With` header, treating it as CSRF. Every client fetch therefore
 * has to send it.
 *
 * ImageUploader did not, so uploading a national-ID card during seller
 * verification failed with "Unauthorized" even though the user was signed in.
 * It was the only mutating client fetch in the codebase missing the header.
 */

const SRC = path.join(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("client fetches that mutate state", () => {
  it("always send the CSRF header the session validator requires", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const source = readFileSync(file, "utf8");
      // Only client components issue browser fetches.
      if (!source.startsWith('"use client"')) continue;
      const mutates = /method:\s*["'`](POST|PATCH|PUT|DELETE)/.test(source)
        || /method:\s*\w+\s*\?\s*["'`](PATCH|PUT)["'`]\s*:\s*["'`]POST/.test(source);
      if (!mutates) continue;
      if (!source.includes("X-Requested-With")) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(offenders, "these mutating fetches will be rejected as CSRF").toEqual([]);
  });

  it("keeps the header on the store upload endpoint specifically", () => {
    const uploader = readFileSync(path.join(SRC, "components", "ImageUploader.tsx"), "utf8");

    expect(uploader).toContain("/api/store/upload");
    expect(uploader).toContain("X-Requested-With");
    // FormData must set its own multipart boundary — declaring Content-Type
    // here would corrupt the upload. Ignore comments, which mention it.
    const code = uploader.replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain('"Content-Type"');
  });
});

describe("seller verification no longer collects a selfie", () => {
  const base = {
    fullName: "علی رضایی",
    nationalId: "0123456703",
    idCardImageUrl: "https://res.cloudinary.com/demo/image/upload/id.jpg",
  };

  it("accepts a submission without one", () => {
    const parsed = KycSubmitSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("still requires the national ID card image", () => {
    const parsed = KycSubmitSchema.safeParse({ ...base, idCardImageUrl: undefined });
    expect(parsed.success).toBe(false);
  });

  it("tolerates a stale client that still posts one", () => {
    // An older cached bundle must not start failing validation mid-deploy.
    const parsed = KycSubmitSchema.safeParse({
      ...base,
      selfieImageUrl: "https://res.cloudinary.com/demo/image/upload/selfie.jpg",
    });
    expect(parsed.success).toBe(true);
  });

  it("is gone from the seller form", () => {
    const form = readFileSync(path.join(SRC, "app", "store", "sell", "page.tsx"), "utf8");
    expect(form).not.toContain("سلفی");
    expect(form).not.toContain("selfieImageUrl");
    // The ID card uploader must remain.
    expect(form).toContain("تصویر کارت ملی");
  });

  it("never writes a selfie URL from the API route", () => {
    const route = readFileSync(
      path.join(SRC, "app", "api", "kyc", "route.ts"),
      "utf8"
    );
    expect(route).not.toContain("selfieImageUrl: data.selfieImageUrl");
  });
});
