import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

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
  },
});
