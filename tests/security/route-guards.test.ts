import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_REGISTRY } from "@/domains/catalog/catalog-registry";

/**
 * A structural check over every API route (src/app/api/**\/route.ts): each
 * handler checks who's calling, writes never pass on a read permission, and
 * every permission key it asks for exists in the seeded catalog (a typo would
 * lock everyone out, or worse, check the wrong thing). Adding a route that
 * breaks one of these fails here, before review.
 */
const API_ROOT = "src/app/api";
const GUARD = /require(Permission|AuthenticatedUser|OrganizationAccess|SelfServiceEmployee|ProjectAccess|AccessibleProjects)\(|checkCronAuthorization\(/;
// Public on purpose: Auth.js's own endpoints and the uptime check.
const PUBLIC = new Set(["src/app/api/auth/[...nextauth]/route.ts", "src/app/api/health/route.ts"]);
// A POST that only reads (a preview) may use a read permission.
const READ_ONLY_WRITES = new Set(["src/app/api/compensation/bulk/route.ts POST"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path.split("\\").join("/")] : [];
  });
}

function handlers(source: string): { method: string; body: string }[] {
  return source
    .split(/(?=export (?:async )?function (?:GET|POST|PUT|PATCH|DELETE)\b)/)
    .slice(1)
    .map((body) => ({ method: body.match(/function (\w+)/)![1], body }));
}

/** Permission keys a handler asks for: string literals passed to requirePermission, or held in a PERMISSION map. */
function literalPermissions(source: string, body: string): string[] {
  const direct = [...body.matchAll(/require(?:Permission|ProjectAccess|AccessibleProjects)\(\s*(?:[^,]*\?\s*)?"([^"]+)"(?:\s*:\s*"([^"]+)")?/g)].flatMap((match) => [match[1], match[2]].filter(Boolean));
  const maps = [...source.matchAll(/const PERMISSION\w*[^=]*=\s*\{([\s\S]*?)\};/g)].flatMap((match) => [...match[1].matchAll(/"([a-z-]+\.[a-z-]+)"/g)].map((key) => key[1]));
  return [...direct, ...(/requirePermission\(PERMISSION/.test(body) ? maps : [])];
}

const seededKeys = new Set([...readFileSync("scripts/seed.ts", "utf8").matchAll(/key:\s*"([^"]+)"/g)].map((match) => match[1]));
const files = routeFiles(API_ROOT);

describe("API route guards", () => {
  it("finds the routes and the seeded permission catalog", () => {
    expect(files.length).toBeGreaterThan(90);
    expect(seededKeys.size).toBeGreaterThan(100);
  });

  it("every handler checks who's calling", () => {
    const unguarded = files
      .filter((file) => !PUBLIC.has(file))
      .flatMap((file) => handlers(readFileSync(file, "utf8")).filter(({ body }) => !GUARD.test(body)).map(({ method }) => `${file} ${method}`));
    expect(unguarded).toEqual([]);
  });

  it("no write handler is allowed through by a read permission", () => {
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return handlers(source)
        .filter(({ method }) => method !== "GET" && !READ_ONLY_WRITES.has(`${file} ${method}`))
        .filter(({ body }) => literalPermissions(source, body).some((key) => key.endsWith(".read")))
        .map(({ method }) => `${file} ${method}`);
    });
    expect(offenders).toEqual([]);
  });

  it("every permission a route asks for is in the seeded catalog", () => {
    const unknown = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return handlers(source).flatMap(({ method, body }) => literalPermissions(source, body).filter((key) => !seededKeys.has(key)).map((key) => `${file} ${method}: ${key}`));
    });
    expect(unknown).toEqual([]);
  });

  it("every catalog type's read, create and update permissions are seeded", () => {
    const missing = Object.values(CATALOG_REGISTRY)
      .flatMap(({ permissionPrefix }) => ["read", "create", "update"].map((action) => `${permissionPrefix}.${action}`))
      .filter((key) => !seededKeys.has(key));
    expect(missing).toEqual([]);
  });
});
