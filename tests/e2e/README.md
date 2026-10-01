# End-to-end tests

Playwright tests for the flows only a real browser, server and database can prove: sign-in,
idle sign-out and a payroll run. Unit, domain and UI tests stay in Vitest (`npm test`).

## One-time setup

```bash
npm i -D @playwright/test
npx playwright install chromium
```

## Database: never the real one

The tests start their own production build on port 4200 and point it at `E2E_MONGODB_URI`
(which overrides `.env.local`). `global-setup.ts` refuses to run unless that database is local,
or its name contains `e2e` or `test`.

1. Create a throwaway database, e.g. `mongodb://127.0.0.1:27017/eychar_e2e`.
2. Seed it: `MONGODB_URI=<that uri> npm run db:seed` with the `SEED_*` values.
3. Sign in once by hand and replace the seeded HR account's temporary password (and set up
   two-step if the organization requires it, or leave that off for the E2E organization).
4. For the payroll test: add a payroll policy and rule version, and pay terms for at least one
   employee. For the approval step, create a second account with `payroll.approve`.

## Run

```bash
E2E_MONGODB_URI=mongodb://127.0.0.1:27017/eychar_e2e \
E2E_USERNAME=hr.e2e E2E_PASSWORD='...' \
E2E_APPROVER_USERNAME=approver.e2e E2E_APPROVER_PASSWORD='...' \
npm run test:e2e
```

`E2E_REUSE_SERVER=1` reuses a server already running on port 4200. Failures keep a trace:
`npx playwright show-trace test-results/<test>/trace.zip`.

`tsconfig.json` leaves `tests/e2e` and `playwright.config.ts` out of `npm run typecheck` so the
check passes before `@playwright/test` is installed. Once it's installed, remove them from
`exclude` to type-check the specs too.
