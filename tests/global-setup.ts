import { MongoMemoryServer } from "mongodb-memory-server";

// Runs once for the whole Vitest run, before any test file's own module
// code executes, so MONGODB_URI is set by the time a test file imports
// @/server/db/connection. One shared in-memory MongoDB for the whole suite.
let mongod: MongoMemoryServer | undefined;

export async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
}

export async function teardown() {
  await mongod?.stop();
}
