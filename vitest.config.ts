import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Run tests in UTC, the way the server runs on Vercel, so any time math that
// leans on the machine's own timezone (instead of src/lib/app-time.ts) fails
// here rather than on the live site.
process.env.TZ = "UTC";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    // One shared in-memory MongoDB for the whole run (tests/global-setup.ts)
    // so domain/authorization tests exercise real Mongoose/MongoDB
    // semantics instead of mocks.
    globalSetup: "./tests/global-setup.ts",
    // Repository/domain tests share ONE in-memory MongoDB across the whole
    // run — parallel worker processes hitting that single mongod produced
    // non-deterministic failures, so file execution is serialized.
    fileParallelism: false,
    clearMocks: true,
    // The suite runs serially against one database; on a busy machine some
    // UI tests brush past Vitest's 5 s default without anything being wrong.
    testTimeout: 15_000,
  },
});
