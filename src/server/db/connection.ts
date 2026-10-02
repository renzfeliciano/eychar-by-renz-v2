import mongoose from "mongoose";

type MongoCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};
const globalMongo = globalThis as typeof globalThis & {
  mongooseCache?: MongoCache;
};
const cache = globalMongo.mongooseCache ?? { connection: null, promise: null };
globalMongo.mongooseCache = cache;

/**
 * Connections per serverless instance. Atlas M0 allows 500 connections in
 * all, and every warm Vercel instance holds its own pool, so each keeps a
 * small one (MONGODB_MAX_POOL_SIZE overrides it) and lets idle connections
 * go after 10s instead of holding them open.
 */
function maxPoolSize(): number {
  const configured = Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE ?? "", 10);
  return Number.isInteger(configured) && configured > 0 ? configured : 5;
}

/**
 * Production never builds indexes at runtime: checking every model's
 * indexes on each cold start costs round trips per collection (about 60
 * models) inside the request that happened to start the instance. Indexes are created once per
 * deploy instead, with `npx tsx scripts/sync-indexes.ts` (create-only, never
 * drops). Development and tests keep building them on connect.
 */
function buildsIndexesOnConnect(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Mongoose builds schema-declared indexes (including `unique: true`) in the
 * background after a model is registered — connecting doesn't wait for
 * that. Awaited explicitly (outside production, see above) so a
 * duplicate-key write can't slip through unrejected in the narrow window
 * right after a fresh database's first requests.
 */
async function ensureIndexesReady() {
  const models = await import("./models");
  await Promise.all(Object.values(models).map((model) => model.init()));
}

export async function connectMongoDB() {
  if (cache.connection) return cache.connection;
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not configured");
  const buildIndexes = buildsIndexesOnConnect();
  cache.promise ??= mongoose
    .connect(mongoUri, {
      maxPoolSize: maxPoolSize(),
      minPoolSize: 0,
      maxIdleTimeMS: 10_000,
      serverSelectionTimeoutMS: 5000,
      // Only turned off in production; elsewhere the global setting (and
      // Mongoose's default) applies, as before. autoCreate goes too: it
      // would still send a createCollection per model on every cold start
      // (collections are created by the first write, or by sync-indexes).
      ...(buildIndexes ? {} : { autoIndex: false, autoCreate: false }),
    })
    .then(async (connection) => {
      if (buildIndexes) await ensureIndexesReady();
      return connection;
    });
  cache.connection = await cache.promise;
  return cache.connection;
}
