import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (tests/e2e, *.spec.ts; Vitest only picks up *.test.*).
 * They run a production build on its own port against a throwaway database
 * (E2E_MONGODB_URI), never the one in .env.local. See tests/e2e/README.md.
 */
const PORT = Number(process.env.E2E_PORT ?? 4200);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Every test starts signed out and signs in itself (helpers.ts, signInAsHR).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production mode, so the nonce CSP and service worker are exercised.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${baseURL}/login`,
    timeout: 300_000,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    // process.env beats .env.local, so the app talks to the E2E database only.
    env: {
      MONGODB_URI: process.env.E2E_MONGODB_URI ?? "",
      NEXTAUTH_URL: baseURL,
    },
  },
});
