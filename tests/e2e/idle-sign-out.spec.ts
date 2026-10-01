import { test, expect, type Page } from "@playwright/test";

// The idle guard runs on the browser's clock, so the tests move that clock
// forward instead of waiting. The idle limit is whatever Settings › Security
// says; time moves in 4-second steps (the shortest allowed warning is 5) so
// the warning can't be skipped. Keep the E2E organization's limit short
// (the default, 1 minute) or this takes a while.
async function waitForIdleWarning(page: Page) {
  const dialog = page.getByTestId("idle-warning-dialog");
  for (let elapsed = 0; elapsed < 2 * 60 * 60_000; elapsed += 4_000) {
    if (await dialog.isVisible()) return dialog;
    await page.clock.fastForward(4_000);
  }
  throw new Error("The idle warning never appeared within 2 hours of idle time");
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("an idle session warns, then signs out to the login page with a notice", async ({ page }) => {
  const dialog = await waitForIdleWarning(page);
  await expect(dialog).toContainText("Are you still there?");

  await page.clock.fastForward(24 * 60 * 60_000);
  await expect(page).toHaveURL(/\/login\?reason=idle/);
  await expect(page.getByRole("status")).toContainText("signed out after a period of inactivity");

  // Signed out for real: the app sends us back to sign in.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("choosing to stay signed in keeps the session", async ({ page }) => {
  const dialog = await waitForIdleWarning(page);
  await page.getByTestId("idle-stay-button").click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
});
