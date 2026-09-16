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
 * Mongoose builds schema-declared indexes (including `unique: true`) in the
 * background after a model is registered — connecting doesn't wait for
 * that. Awaited explicitly so a duplicate-key write can't slip through
 * unrejected in the narrow window right after a fresh database's first
 * requests (on a long-lived cluster the indexes already exist, so this is
 * a fast no-op confirmation on every later cold start).
 */
async function ensureIndexesReady() {
  const models = await import("./models");
  await Promise.all(Object.values(models).map((model) => model.init()));
}

export async function connectMongoDB() {
  if (cache.connection) return cache.connection;
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not configured");
  cache.promise ??= mongoose
    .connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    .then(async (connection) => {
      await ensureIndexesReady();
      return connection;
    });
  cache.connection = await cache.promise;
  return cache.connection;
}
