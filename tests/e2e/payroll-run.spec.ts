import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

// A period far in the future so it never overlaps a real run, unique per test run.
function futurePeriod() {
  const year = 2090 + Math.floor(Math.random() * 9);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  return { start: `${year}-${month}-01`, end: `${year}-${month}-15`, payDate: `${year}-${month}-20` };
}

/**
 * Needs the E2E database to have a payroll policy and rule version that
 * apply in the future, and at least one employee with pay terms.
 * Approving needs a second account with payroll.approve
 * (E2E_APPROVER_USERNAME / E2E_APPROVER_PASSWORD): whoever prepared a run
 * can't approve it.
 */
test("HR prepares a payroll run and submits it; a second person approves it", async ({ page, browser }) => {
  const period = futurePeriod();
  await page.goto("/payroll");
  await page.getByTestId("payroll-new-run-button").click();
  await page.getByLabel("Period from").fill(period.start);
  await page.getByLabel("Period to").fill(period.end);
  await page.getByLabel("Pay date").fill(period.payDate);
  await page.getByTestId("payroll-new-run-submit").click();

  await expect(page).toHaveURL(/\/payroll\/[a-f0-9]{24}$/);
  await expect(page.getByTestId("payroll-register")).toBeVisible();
  const runUrl = page.url();

  await page.getByTestId("payroll-run-submit").click();
  await page.getByTestId("payroll-run-dialog-confirm").click();
  await expect(page.getByText(/submitted for approval/)).toBeVisible();

  const approver = process.env.E2E_APPROVER_USERNAME;
  if (!approver) {
    // Without a second account, leave nothing behind: cancel the run.
    await page.getByTestId("payroll-run-cancel").click();
    await page.getByRole("dialog").getByRole("textbox").fill("End-to-end test run");
    await page.getByTestId("payroll-run-dialog-confirm").click();
    await expect(page.getByText(/cancelled/)).toBeVisible();
    test.info().annotations.push({ type: "skipped-step", description: "Approval: set E2E_APPROVER_USERNAME and E2E_APPROVER_PASSWORD" });
    return;
  }

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const approverPage = await context.newPage();
  await signIn(approverPage, approver, process.env.E2E_APPROVER_PASSWORD!);
  await expect(approverPage).toHaveURL(/\/dashboard/);
  await approverPage.goto(runUrl);
  await approverPage.getByTestId("payroll-run-approve").click();
  await approverPage.getByTestId("payroll-run-dialog-confirm").click();
  await expect(approverPage.getByText(/approved/).first()).toBeVisible();

  // Return it to draft and cancel, so the test leaves no approved run behind.
  await approverPage.getByTestId("payroll-run-return").click();
  await approverPage.getByRole("dialog").getByRole("textbox").fill("End-to-end test run");
  await approverPage.getByTestId("payroll-run-dialog-confirm").click();
  await expect(approverPage.getByText(/returned to draft/)).toBeVisible();
  await context.close();
});
