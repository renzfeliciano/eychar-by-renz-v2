import { test as setup, expect } from "@playwright/test";
import { signIn } from "./helpers";

// Signs the HR test account in once and saves the cookies for every other spec.
setup("sign in as HR", async ({ page }) => {
  await signIn(page, process.env.E2E_USERNAME!, process.env.E2E_PASSWORD!);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: "tests/e2e/.auth/hr.json" });
});
