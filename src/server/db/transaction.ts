// Mongoose's own driver copy (not the top-level `mongodb` package), so the
// session type matches every model and collection call.
import mongoose, { type ClientSession } from "mongoose";
import { connectMongoDB } from "./connection";

export type { ClientSession };

/**
 * Runs `work` in a MongoDB transaction (ADR-041): every write that passes
 * `session` either all lands or none does. Mongoose commits when `work`
 * resolves, aborts when it throws, and retries the whole function on a
 * transient error, so `work` must be safe to run again: compute first,
 * then write.
 *
 * Keep the work small: only the group of writes that must not be split
 * (and the reads they depend on). Long reads and audit records stay outside.
 * Every operation inside must pass `{ session }`; one that doesn't runs
 * outside the transaction.
 */
export async function withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  await connectMongoDB();
  return mongoose.connection.transaction(work);
}
