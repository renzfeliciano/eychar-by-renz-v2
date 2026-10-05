// Runs each test file on its own, one after another, with a time limit, and
// prints one line per file: ok, FAIL or TIMEOUT. Use it to find a test file
// that hangs or runs out of memory when the whole group runs together.
//
//   npm run test:each                      (the test:core group)
//   npm run test:each -- tests/domains     (any folders you name)
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const LIMIT_MS = 150_000;
const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["tests/server", "tests/security", "tests/lib", "tests/shared", "tests/standards"];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.test\.tsx?$/.test(name) ? [path.replaceAll("\\", "/")] : [];
  });

const files = roots.flatMap(walk).sort();
const problems = [];
console.log(`Running ${files.length} test files one at a time…\n`);
for (const file of files) {
  const started = Date.now();
  // Node runs Vitest directly (no shell in between), so the time limit really stops it.
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", file], { stdio: "ignore", timeout: LIMIT_MS, killSignal: "SIGKILL" });
  const seconds = ((Date.now() - started) / 1000).toFixed(0).padStart(4);
  const status = result.error?.code === "ETIMEDOUT" || result.signal ? "TIMEOUT" : result.status === 0 ? "ok" : "FAIL";
  if (status !== "ok") problems.push(`${status}  ${file}`);
  console.log(`${status.padEnd(8)}${seconds}s  ${file}`);
}
console.log(problems.length ? `\nProblem files:\n${problems.join("\n")}` : "\nEvery file passed on its own.");
process.exit(problems.length ? 1 : 0);
