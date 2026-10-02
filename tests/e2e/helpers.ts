import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Signs the HR test account in for this test. Each test signs in itself
 * rather than sharing saved cookies: an account has one active session at a
 * time (src/server/auth/session-policy.ts), so any later sign-in, or the idle
 * test's real sign-out, would leave shared cookies signed out.
 */
export async function signInAsHR(page: Page) {
  await signIn(page, process.env.E2E_USERNAME!, process.env.E2E_PASSWORD!);
  await expect(page).toHaveURL(/\/dashboard/);
  await acknowledgeReplacedSession(page);
}

/**
 * Signing in again while an earlier test's session is still live ends that
 * session, and the app says so once ("Signed out on your other device").
 * That's correct behaviour, so acknowledge it the way a person would.
 */
export async function acknowledgeReplacedSession(page: Page) {
  const notice = page.getByRole("dialog", { name: "Signed out on your other device" });
  const shown = await notice
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await notice.getByRole("button", { name: "Got it" }).click();
  await expect(notice).toBeHidden();
}
