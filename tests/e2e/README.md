# End-to-end tests

Playwright tests for the flows only a real browser, server and database can prove: sign-in,
idle sign-out and a payroll run. Unit, domain and UI tests stay in Vitest (`npm test`).

## In CI

The `e2e` job in `.github/workflows/ci.yml` runs after the `check` job passes. It starts MongoDB 7
as a single-node replica set (transactions need one, ADR-041), seeds it with
`scripts/seed-e2e.ts`, then runs `npm run test:e2e`. All its accounts and passwords are throwaway
values that only exist inside that job. A failed run keeps the HTML report and traces as the
`playwright-report` artifact for 7 days.

## Locally

You need a MongoDB **replica set** you can throw away (Atlas free tier is one; so is a local
`mongod --replSet rs0` after `rs.initiate()`). Never use the database from `.env.local`.

```bash
npx playwright install chromium     # once

export E2E_MONGODB_URI=mongodb://127.0.0.1:27017/eychar_e2e
export E2E_USERNAME=hr.e2e E2E_PASSWORD='choose-a-long-passphrase-1'
export E2E_APPROVER_USERNAME=approver.e2e E2E_APPROVER_PASSWORD='another-long-passphrase-2'

npx tsx scripts/seed-e2e.ts         # sets everything up; safe to re-run
npm run test:e2e
```

`scripts/seed-e2e.ts` runs the normal seed, makes the HR account sign in with `E2E_PASSWORD`
(no forced change, no two-step), keeps the idle limit at one minute, hires one employee with pay
terms, and creates the approver account with a role that can approve payroll. Without the
approver variables, the payroll test skips its approval step.

Both the seed and the tests refuse a database that isn't local or whose name doesn't contain
`e2e` or `test` (`assertSafeE2EDatabase` in `global-setup.ts`).

Each test signs in on its own (`signInAsHR` in `helpers.ts`). An account has one active session
at a time, so signing in again ends the previous test's session and the app shows "Signed out on
your other device"; the helper acknowledges it the way a person would.

The config builds the app and starts it on port 4200 (`E2E_PORT`). `E2E_REUSE_SERVER=1` reuses a
server already running there. Failures keep a trace:
`npx playwright show-trace test-results/<test>/trace.zip`.
