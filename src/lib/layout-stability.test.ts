import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cumulative Layout Shift guards.
 *
 * Two patterns kept reintroducing CLS on real pages:
 *
 * 1. A loading skeleton shorter than the state it is replaced by. /store/sell
 *    rendered `min-h-[60dvh]` while loading and `min-h-[100dvh]` once the KYC
 *    check resolved, so the document grew from 1065px to 1524px and shoved the
 *    footer down — measured at 0.16 CLS, above Google's 0.1 "good" threshold.
 *
 * 2. Bare <img> with no intrinsic size. The browser cannot reserve space
 *    before the bytes arrive. /honors measured 0.395 CLS this way.
 *
 * Error and empty states are deliberately exempt from (1): they are terminal,
 * nothing replaces them, so a shorter box causes no shift.
 */

const APP = path.join(process.cwd(), "src", "app");

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pageFiles(full));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(process.cwd(), f);

describe("layout stability", () => {
  it("never renders a loading skeleton shorter than the loaded page", () => {
    const offenders: string[] = [];

    for (const file of pageFiles(APP)) {
      const source = readFileSync(file, "utf8");
      // Only guard branches that are explicitly keyed off a loading flag.
      const pattern = /if\s*\(\s*!?\s*loading\w*\s*\)[\s\S]{0,300}?min-h-\[(\d+)dvh\]/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source))) {
        if (Number(match[1]) < 100) {
          offenders.push(`${rel(file)} (min-h-[${match[1]}dvh])`);
        }
      }
    }

    expect(
      offenders,
      "these loading states are shorter than their loaded page and will shift the footer"
    ).toEqual([]);
  });

  it("keeps the highest-traffic pages free of unsized images", () => {
    // These are the pages CLS was actually measured on. Bare <img> here means
    // the browser cannot reserve space; use AppImage (next/image) instead.
    const guarded = [
      "page.tsx",
      path.join("honors", "page.tsx"),
      path.join("store", "sell", "page.tsx"),
    ];

    const offenders: string[] = [];
    for (const suffix of guarded) {
      const file = path.join(APP, suffix);
      const source = readFileSync(file, "utf8");
      const count = (source.match(/<img\b/g) || []).length;
      if (count > 0) offenders.push(`${rel(file)} has ${count} bare <img>`);
    }

    expect(offenders, "use AppImage so the layout box is reserved").toEqual([]);
  });

  it("AppImage requires an explicit alt so decorative images are deliberate", () => {
    const component = readFileSync(
      path.join(process.cwd(), "src", "components", "AppImage.tsx"),
      "utf8"
    );
    expect(component).toContain("alt: string");
    // Empty alt must also mark the image as decorative for screen readers.
    expect(component).toContain('aria-hidden');
  });
});
