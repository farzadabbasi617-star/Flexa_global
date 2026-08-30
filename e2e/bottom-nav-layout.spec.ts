import { expect, test } from "@playwright/test";

/**
 * Regression guard for the desktop bottom-nav overlap.
 *
 * The nav is `position: fixed` with a 520px cap so it reads as a phone dock.
 * On a phone the viewport is narrower than the cap, so it spans the full width
 * and sits flush at the bottom — which is why the bug was invisible on mobile.
 *
 * On desktop that same cap left it centred with ~700px of dead space on each
 * side, floating mid-layout, and nothing reserved room for it — so it painted
 * over real content (game cards on the home page, player rows on the
 * leaderboard, news cards in the hall of fame).
 */

const NAV = ".site-bottom-nav";
const PAGES = ["/", "/store", "/leaderboard", "/honors"];
const WIDTHS = [
  { name: "desktop", width: 1920, height: 1080 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
];

for (const viewport of WIDTHS) {
  test.describe(`bottom nav @ ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("stays anchored to the bottom edge", async ({ page }) => {
      await page.goto("/");
      const nav = page.locator(NAV);
      await expect(nav).toBeVisible();

      const box = (await nav.boundingBox())!;
      const innerHeight = await page.evaluate(() => window.innerHeight);

      // Flush with the bottom of the viewport (small tolerance for rounding).
      expect(innerHeight - (box.y + box.height)).toBeLessThanOrEqual(2);
    });

    test("is not a narrow island floating mid-screen", async ({ page }) => {
      await page.goto("/");
      const box = (await page.locator(NAV).boundingBox())!;

      // Must cover a sensible share of the viewport rather than sitting in a
      // 520px puddle surrounded by empty space.
      expect(box.width).toBeGreaterThanOrEqual(Math.min(viewport.width * 0.5, 720));
    });

    test("reserves space so content is never trapped underneath", async ({ page }) => {
      await page.goto("/");
      const reserved = await page.evaluate(
        () => parseFloat(getComputedStyle(document.body).paddingBottom) || 0
      );
      const navHeight = (await page.locator(NAV).boundingBox())!.height;

      expect(reserved).toBeGreaterThanOrEqual(navHeight);
    });

    for (const path of PAGES) {
      test(`does not cover content on ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.locator(NAV).waitFor();

        // Scroll to the very end — the worst case for a fixed bottom bar.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(600);

        const covered = await page.evaluate((navSelector) => {
          const nav = document.querySelector(navSelector);
          if (!nav) return null;
          const rect = nav.getBoundingClientRect();

          // Probe just inside the bar's top edge, across its width.
          //
          // Only leaf-ish content counts as "covered". BODY/HTML always sit in
          // the hit stack (they span the page and inherit all descendant text),
          // and a wrapper that merely *contains* the reserved gap is fine — the
          // bug is a real heading/card/button being painted over.
          const interesting = ["H1", "H2", "H3", "H4", "P", "BUTTON", "A", "LI"];
          for (const fraction of [0.2, 0.5, 0.8]) {
            const hit = document
              .elementsFromPoint(rect.left + rect.width * fraction, rect.top + 18)
              .find((el) => {
                if (nav.contains(el)) return false;
                if (!interesting.includes(el.tagName)) return false;
                if (!(el.textContent || "").trim()) return false;

                // The only thing that matters: does this element's own box
                // actually intersect the bar? elementsFromPoint also reports
                // ancestors that merely span the probe point, and those are
                // not overlaps — their visible content sits far above.
                const box = el.getBoundingClientRect();
                return box.height > 0 && box.bottom > rect.top + 4;
              });
            if (hit) return `${hit.tagName}: ${(hit.textContent || "").trim().slice(0, 40)}`;
          }
          return null;
        }, NAV);

        expect(covered, `bottom nav is covering content on ${path}`).toBeNull();
      });
    }
  });
}
