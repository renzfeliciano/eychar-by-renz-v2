import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * House rule: every add, update or delete gives feedback — a spinner with
 * present-participle text while it runs, and a toast when it's done (errors
 * shown inline or as a toast). This scans every client component that sends
 * a POST/PATCH/PUT/DELETE so a new screen can't quietly skip it.
 */
const ROOTS = ["src/app", "src/components"];
const MUTATION = /method:\s*"(POST|PATCH|PUT|DELETE)"/;
// ConfirmDialog renders its own spinner with confirmLoadingLabel.
const SPINNER = /Loader2|animate-spin|<ConfirmDialog/;
const TOAST = /toast\.(success|error)/;

// Deliberate exceptions, each with its reason.
const NO_SPINNER: Record<string, string> = {
  "src/app/(app)/recruitment/tracking/applicant-pipeline.tsx": "optimistic drag-and-drop: the card moves at once and rolls back with a toast on failure",
  "src/app/(app)/leave/types/convertible-toggle.tsx": "a checkbox that's disabled while saving, then confirmed with a toast",
};
const NO_TOAST: Record<string, string> = {
  "src/app/(self-service)/clock/clock-panel.tsx": "the clock card itself switches to the clocked-in/out state as confirmation",
  "src/components/shared/change-password-form.tsx": "shows its own success panel and signs the person in afresh",
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

const files = ROOTS.flatMap(walk)
  .map((path) => ({ path: relative(process.cwd(), path).replaceAll("\\", "/"), source: readFileSync(path, "utf8") }))
  .filter((file) => MUTATION.test(file.source));

describe("mutation feedback standard", () => {
  it("finds the components to check", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("shows a spinner while saving", () => {
    expect(files.filter((file) => !SPINNER.test(file.source) && !NO_SPINNER[file.path]).map((file) => file.path)).toEqual([]);
  });

  it("confirms with a toast when done", () => {
    expect(files.filter((file) => !TOAST.test(file.source) && !NO_TOAST[file.path]).map((file) => file.path)).toEqual([]);
  });
});
