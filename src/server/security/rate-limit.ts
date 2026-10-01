import { connectMongoDB } from "@/server/db/connection";
import { LoginThrottleModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { RateLimitError } from "@/shared/errors";

/**
 * Per-user limits on heavy, bulk or guessable operations (exports, payroll
 * generation, bulk pay and leave changes, password confirmations, uploads). Fixed windows stored in MongoDB (the same
 * TTL-swept counter collection the sign-in throttle uses, under an "rl:"
 * key), so the limit holds across restarts and every server instance on
 * Vercel. Generous enough never to bother normal work; it only stops a
 * script or a stuck button from hammering the database.
 */
export const RATE_LIMITS = {
  export: { limit: 30, windowMs: 10 * 60_000, label: "exports" },
  payrollRun: { limit: 10, windowMs: 10 * 60_000, label: "payroll runs" },
  bulkChange: { limit: 20, windowMs: 10 * 60_000, label: "bulk changes" },
  // Re-entering your password to confirm a sensitive change (change password,
  // turn off two-step, new recovery codes): stops guessing from a live session.
  passwordCheck: { limit: 8, windowMs: 15 * 60_000, label: "password attempts" },
  documentUpload: { limit: 30, windowMs: 10 * 60_000, label: "uploads" },
  // Each recalculates a whole payroll run (recompute, submit, adjustments).
  payrollCompute: { limit: 60, windowMs: 10 * 60_000, label: "payroll recalculations" },
  bulkPreview: { limit: 60, windowMs: 10 * 60_000, label: "bulk previews" },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** Counts one use of `name` by `userId`; throws RateLimitError (HTTP 429) past the limit. */
export async function enforceRateLimit(name: RateLimitName, userId: string, now: Date = new Date()): Promise<void> {
  const { limit, windowMs, label } = RATE_LIMITS[name];
  await connectMongoDB();
  const key = `rl:${name}:${userId}`;
  const cutoff = new Date(now.getTime() - windowMs);

  let current = await LoginThrottleModel.findOneAndUpdate({ key, windowStart: { $gt: cutoff } }, { $inc: { count: 1 } }, { new: true }).lean<{ count: number; windowStart: Date } | null>();
  if (!current) {
    // No live window: start one (replacing an expired one if it's still there).
    current = await LoginThrottleModel.findOneAndUpdate(
      { key },
      { $set: { count: 1, windowStart: now, expiresAt: new Date(now.getTime() + windowMs) } },
      { new: true, upsert: true },
    ).lean<{ count: number; windowStart: Date } | null>();
  }
  if (current && current.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(current.windowStart).getTime() + windowMs - now.getTime()) / 1000));
    const minutes = Math.ceil(retryAfterSeconds / 60);
    throw new RateLimitError(`Too many ${label} in a short time. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, retryAfterSeconds);
  }
}

/** Records who downloaded what: exports carry people's personal and pay data out of the system. */
export async function auditExport(input: {
  organizationId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await AuditService.record({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? input.organizationId,
    metadata: input.metadata,
  });
}
