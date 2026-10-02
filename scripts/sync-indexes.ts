/**
 * Creates every index the Mongoose schemas declare, once per deploy.
 * Production doesn't build indexes at runtime (src/server/db/connection.ts),
 * so run this whenever a deploy adds or changes an index:
 *
 *   npx tsx scripts/sync-indexes.ts
 *
 * Create-only: it never drops an index, unlike Mongoose's syncIndexes().
 * Indexes in the database that no schema declares any more are only
 * listed, for someone to review and drop by hand. Idempotent; an index
 * that already exists with the same definition is a no-op. Needs
 * MONGODB_URI (from .env.local / .env or the environment).
 */
import mongoose from "mongoose";
import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ path: ".env" });

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");
  // Build nothing implicitly; every index below is created explicitly.
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000, autoIndex: false, autoCreate: false });
  const models = await import("@/server/db/models");

  let failed = 0;
  for (const model of Object.values(models)) {
    const name = model.collection.collectionName;
    try {
      await model.createCollection().catch((error: { codeName?: string }) => {
        if (error?.codeName !== "NamespaceExists") throw error;
      });
      // Mongoose's own build of the schema's indexes, the same one autoIndex
      // runs in development: createIndex per index, nothing dropped.
      await model.createIndexes();
      const { toDrop } = await model.diffIndexes();
      console.log(`${name}: ok${toDrop.length ? ` (not in the schema, left in place: ${toDrop.join(", ")})` : ""}`);
    } catch (error) {
      failed += 1;
      console.error(`${name}: FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await mongoose.disconnect();
  if (failed) {
    console.error(`${failed} collection(s) failed. Fix the cause (e.g. duplicate values blocking a unique index) and run again.`);
    process.exitCode = 1;
  } else {
    console.log("All indexes are in place.");
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
