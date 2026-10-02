import { test, expect } from "@playwright/test";
import { signIn, signInAsHR } from "./helpers";

test("HR signs in and lands on the dashboard", async ({ page }) => {
  await signInAsHR(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a wrong password is refused with a clear message", async ({ page }) => {
  // An account that doesn't exist, so the real test account never gets locked out.
  await signIn(page, `nobody.${Date.now()}`, "Not-the-password-1");
  // Scoped to the form: Next's route announcer is a role="alert" too.
  await expect(page.getByRole("form", { name: "Sign in" }).getByRole("alert")).toHaveText(/Invalid username\/email or password/);
  await expect(page).toHaveURL(/\/login/);
});

test("a signed-out visitor is sent to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
