import { expect, test } from "@playwright/test";

/**
 * The room page splits into "روم" (things you act on) and "توضیحات" (things you
 * read). Both must always have content: an earlier version left the room tab
 * completely blank for a logged-out visitor because every section inside it was
 * gated behind membership or staff role.
 *
 * Needs a published room, so it is skipped when COD_E2E_ROOM_ID is unset.
 */
const roomId = process.env.COD_E2E_ROOM_ID;

test.describe("COD room tabs", () => {
  test.skip(!roomId, "set COD_E2E_ROOM_ID to a published room to run this");

  test("both tabs render content for a logged-out visitor", async ({ page }) => {
    await page.goto(`/cod-arena/${roomId}`);
    await page.waitForSelector('[role="tablist"]');

    const about = page.locator("#cod-panel-about");
    const room = page.locator("#cod-panel-room");

    await expect(about).toBeVisible();
    await expect(room).toBeHidden();

    await page.locator("#cod-tab-room").click();
    await expect(room).toBeVisible();
    await expect(about).toBeHidden();
    // The blank-tab regression: the panel must carry real content.
    expect((await room.innerText()).trim().length).toBeGreaterThan(100);

    await page.locator("#cod-tab-about").click();
    await expect(about).toBeVisible();
  });

  test("FAQ panels open independently and are keyboard operable", async ({ page }) => {
    await page.goto(`/cod-arena/${roomId}`);
    await page.waitForSelector('[role="tablist"]');

    const faq = page.locator("#cod-panel-about [aria-expanded]");
    const count = await faq.count();
    test.skip(count < 2, "room has no FAQ configured");

    await expect(faq.nth(0)).toHaveAttribute("aria-expanded", "true");
    await faq.nth(1).click();
    // Opening one must not close the other.
    await expect(faq.nth(0)).toHaveAttribute("aria-expanded", "true");
    await expect(faq.nth(1)).toHaveAttribute("aria-expanded", "true");

    await faq.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(faq.nth(1)).toHaveAttribute("aria-expanded", "false");
  });

  test("the docked join bar sits at the bottom edge on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/cod-arena/${roomId}`);
    await page.waitForSelector('[role="tablist"]');

    const dock = page.locator("div.fixed.bottom-0").first();
    if (await dock.count() === 0) test.skip(true, "viewer has already joined");
    const box = await dock.boundingBox();
    expect(box).not.toBeNull();
    // It must be docked, not floating mid-screen.
    expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(840);
  });
});
