/**
 * Refuses to run against anything that could be real data: the E2E database
 * must be local, or its name must say it's for tests. scripts/seed-e2e.ts
 * applies the same rule before it writes anything.
 */
export function assertSafeE2EDatabase(uri: string | undefined): string {
  if (!uri) throw new Error("Set E2E_MONGODB_URI to a throwaway database (see tests/e2e/README.md).");
  const url = new URL(uri.replace(/^mongodb(\+srv)?:/, "http:"));
  const database = url.pathname.replace(/^\//, "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && !/(e2e|test)/i.test(database)) {
    throw new Error(`E2E_MONGODB_URI points at "${url.hostname}/${database}". Use a local database, or one whose name contains "e2e" or "test".`);
  }
  return uri;
}

export default function globalSetup() {
  assertSafeE2EDatabase(process.env.E2E_MONGODB_URI);
  for (const name of ["E2E_USERNAME", "E2E_PASSWORD"]) {
    if (!process.env[name]) throw new Error(`Set ${name} (an HR account in the E2E database that has already replaced its first password; npx tsx scripts/seed-e2e.ts sets one up).`);
  }
}
