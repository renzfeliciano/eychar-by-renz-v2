---
name: e2e-testing
description: How to write and run Playwright end-to-end tests for EychAr's critical flows (sign-in, clock-in, schedules, payroll, leave) against a running app and a disposable test database. Load when adding or changing a critical user flow, or when asked for E2E/browser tests.
---

# End-to-end tests (EychAr)

Adapted for this app from ECC's `e2e-testing` skill (affaan-m/ECC, MIT). Unit/domain/UI tests stay in Vitest (`npm test`); E2E covers what only a real browser + server + database can prove (cookies, CSP, redirects, the full flow).

## Setup (first time only — not installed yet)
- `npm i -D @playwright/test` (the browsers are already installed on most machines via `npx playwright install chromium`).
- `playwright.config.ts` at the repo root: `testDir: "tests/e2e"`, `baseURL: "http://localhost:4100"`, `use: { trace: "retain-on-failure", screenshot: "only-on-failure" }`, and `webServer: { command: "npm run build && npm run start", url: "http://localhost:4100", reuseExistingServer: true }` — production mode, so the nonce CSP and service worker are exercised.
- Exclude `tests/e2e/**` from Vitest's `include` (it uses `tests/**/*.test.{ts,tsx}`; name E2E files `*.spec.ts`).
- Script: `"test:e2e": "playwright test"`.

## Data — never production
- E2E runs against a **dedicated test database**: `MONGODB_URI` pointing at a throwaway database (e.g. `eychar_e2e`), seeded by `npm run db:seed` with `SEED_*` test values. Refuse to run if `MONGODB_URI` looks like the production cluster.
- Each test creates what it needs through the UI or API and uses unique names (`Holiday ${Date.now()}`) so tests don't depend on each other.
- Credentials come from env (`E2E_USERNAME`, `E2E_PASSWORD`), never committed.

## Writing tests
- Locate by role/label/test id: `page.getByRole("button", { name: "Stay signed in" })`, `page.getByTestId("schedule-holidays-button")` (the app's `data-testid` convention is `<feature>-<element>-<action>`).
- Never `waitForTimeout`; wait for the UI state: `await expect(page.getByText("Added …")).toBeVisible()`.
- One flow per test, named as the user outcome: `test("HR loads the 2026 Philippine holidays and sees them on the schedule")`.
- Log in once per worker with `storageState`; keep a separate fresh-login test for the sign-in flow itself.
- Mobile flows (clock-in) run in a phone project: `devices["Pixel 7"]` with camera/geolocation permissions and a fake media stream.

## Critical flows to cover first
1. Sign in → dashboard; wrong password message; idle sign-out notice.
2. Temporary password → forced change → signed in again.
3. Schedules: assign a shift, open a day panel, load holidays, add a note.
4. Leave request → approval → balance changes.
5. Payroll run: prepare → review → approve (no release against real banks).
6. Self-service clock-in on a phone viewport (camera mocked).
7. Security smoke: a page has no CSP violations in the console; an API call from another origin gets 403.

## Flaky tests
- Fix the cause (missing await on UI state, shared data, animations) rather than adding retries; quarantine with `test.fixme` and a reason only as a last resort.
- On failure, read the trace (`npx playwright show-trace`) before changing anything.
