import { MongoMemoryReplSet } from "mongodb-memory-server";

// Runs once for the whole Vitest run, before any test file's own module
// code executes, so MONGODB_URI is set by the time a test file imports
// @/server/db/connection. One shared in-memory MongoDB for the whole suite.
// A single-node replica set, not a standalone server: transactions
// (src/server/db/transaction.ts, ADR-041) only work on a replica set, as on Atlas.
let replSet: MongoMemoryReplSet | undefined;

export async function setup() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = replSet.getUri();
}

export async function teardown() {
  await replSet?.stop();
}
