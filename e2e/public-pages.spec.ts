import { expect, test } from "@playwright/test";

test("home page loads with the Persian document direction", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/گیمنت|Gament/i);
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("body")).toBeVisible();
});

test("login page is reachable", async ({ page }) => {
  const response = await page.goto("/login");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("body")).toBeVisible();
});

test("password recovery page is reachable", async ({ page }) => {
  const response = await page.goto("/forgot-password");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.locator("body")).toBeVisible();
});

test("public tournament page is reachable", async ({ page }) => {
  const response = await page.goto("/tournaments");

  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toBeVisible();
});

test("COD Arena private-beta landing is reachable", async ({ page }) => {
  const response = await page.goto("/cod-arena");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/COD Arena/i);
  await expect(page.getByRole("heading", { level: 1, name: /^Gament COD Arena$/i })).toBeVisible();
});

test("registration warns users to check Spam or Junk for the OTP", async ({ page }) => {
  const response = await page.goto("/register");
  expect(response?.ok()).toBe(true);
  await expect(page.getByText(/Spam|Junk/i).first()).toBeVisible();
});

test("password recovery warns users to check Spam or Junk", async ({ page }) => {
  const response = await page.goto("/forgot-password");
  expect(response?.ok()).toBe(true);
  await expect(page.getByText(/Spam|Junk/i).first()).toBeVisible();
});
