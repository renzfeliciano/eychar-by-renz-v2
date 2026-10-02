import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { iconForAction } from "@/components/ui/action-icon";
import { ArrowLeft, Check, Lock, Plus, Save, Send, Trash2, X } from "lucide-react";

/**
 * House rule: every button shows an icon plus a word ("Sign in"). While it
 * works, a spinner takes the icon's place and the word becomes the present
 * participle ("Signing in…"). <Button icon pending pendingLabel> does both,
 * so no button draws its own spinner, and no labelled button goes without an icon.
 */
const ROOTS = ["src/app", "src/components"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** Every <Button …>…</Button> with its opening-tag attributes and children. */
function buttons(source: string): { attrs: string; body: string; line: number }[] {
  const found: { attrs: string; body: string; line: number }[] = [];
  let at = source.indexOf("<Button");
  while (at >= 0) {
    // Walk the opening tag, skipping {...} so `=>` inside handlers doesn't end it.
    let i = at + "<Button".length;
    let depth = 0;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const attrs = source.slice(at + 7, i);
    const selfClosing = attrs.trimEnd().endsWith("/");
    const end = selfClosing ? i : source.indexOf("</Button>", i);
    found.push({ attrs, body: selfClosing ? "" : source.slice(i + 1, end), line: source.slice(0, at).split("\n").length });
    at = source.indexOf("<Button", end);
  }
  return found;
}

// Deliberate exceptions, each with its reason.
const EXEMPT: Record<string, string> = {
  "src/app/(app)/attendance/schedules/schedule-grid.tsx": "shift-code chips (D, N, OFF) are codes, not actions; the spinner replaces the code while it saves",
};

const files = ROOTS.flatMap(walk)
  .filter((path) => !path.includes("components/ui/"))
  .map((path) => ({ path: relative(process.cwd(), path).replaceAll("\\", "/"), source: readFileSync(path, "utf8") }))
  .filter((file) => !EXEMPT[file.path]);

describe("button standard", () => {
  it("never draws its own spinner inside a <Button>; uses pending instead", () => {
    const offenders = files.flatMap((file) =>
      buttons(file.source)
        .filter((button) => /Loader2|animate-spin/.test(button.body))
        .map((button) => `${file.path}:${button.line}`),
    );
    expect(offenders).toEqual([]);
  });

  it("gives every labelled <Button> an icon", () => {
    const offenders = files.flatMap((file) =>
      buttons(file.source)
        .filter((button) => !/size="icon/.test(button.attrs) && !/\bicon=\{/.test(button.attrs) && !/\brender=\{/.test(button.attrs))
        .filter((button) => button.body.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").trim() !== "")
        .filter((button) => !/<[A-Z]\w*\b[^>]*\/>/.test(button.body))
        .map((button) => `${file.path}:${button.line}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("iconForAction", () => {
  it.each([
    ["Save changes", Save],
    ["Add employee", Plus],
    ["Submit for approval", Send],
    ["Release", Send],
    ["Approve", Check],
    ["Cancel", X],
    ["Keep it", ArrowLeft],
    ["Move to recycle bin", Trash2],
    ["Close cycle", Lock],
    ["Something unusual", Check],
  ])("%s", (label, icon) => {
    expect(iconForAction(label)).toBe(icon);
  });
});
