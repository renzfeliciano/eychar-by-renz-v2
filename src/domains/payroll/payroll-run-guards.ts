// Lookups and guards shared by PayrollRunService: loading a run inside its
// organization, numbering, overlap checks and the compute lock.
import { randomUUID } from "crypto";
import { Types } from "mongoose";
import { PayrollRunModel } from "@/server/db/models";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { dateKeyToDate, dateToDateKey, formatDateRange } from "@/lib/date-key";

export async function findRun(runId: string, organizationId: string) {
  if (!Types.ObjectId.isValid(runId)) throw new NotFoundError("Payroll run not found in this organization");
  const run = await PayrollRunModel.findOne({ _id: new Types.ObjectId(runId), organizationId: new Types.ObjectId(organizationId) });
  if (!run) throw new NotFoundError("Payroll run not found in this organization");
  return run;
}

export async function nextRunNumber(organizationId: string, payDate: string): Promise<string> {
  const prefix = `PR-${payDate.slice(0, 4)}-`;
  const latest = await PayrollRunModel.findOne({ organizationId: new Types.ObjectId(organizationId), runNumber: { $regex: `^${prefix}` } })
    .sort({ runNumber: -1 })
    .select("runNumber")
    .lean();
  const next = latest ? Number(String(latest.runNumber).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/**
 * The same people can't be paid twice for the same day: an organization-wide
 * run conflicts with any other run over overlapping dates, and a project run
 * conflicts with organization-wide runs and runs for the same project.
 * Cancelled runs don't count.
 */
/** `createdBefore`: only runs created before this one count (the re-check after insert, see prepare). */
export async function assertNoOverlap(organizationId: string, projectId: string | undefined, start: string, end: string, createdBefore?: Types.ObjectId) {
  const overlapping = await PayrollRunModel.find({
    organizationId: new Types.ObjectId(organizationId),
    ...(createdBefore ? { _id: { $lt: createdBefore } } : {}),
    status: { $ne: "cancelled" },
    payPeriodStart: { $lte: dateKeyToDate(end) },
    payPeriodEnd: { $gte: dateKeyToDate(start) },
  }).lean();
  const conflict = overlapping.find((run) => !projectId || !run.projectId || run.projectId.toString() === projectId);
  if (conflict) {
    throw new ConflictError(
      `${conflict.runNumber} already covers ${formatDateRange(dateToDateKey(conflict.payPeriodStart), dateToDateKey(conflict.payPeriodEnd))} for these employees. Cancel it first to prepare another.`,
    );
  }
}

const COMPUTE_LOCK_MS = 120_000;
export const NO_ACTIVE_LOCK = (now: Date) => ({ $or: [{ computeLockUntil: { $exists: false } }, { computeLockUntil: null }, { computeLockUntil: { $lt: now } }] });

/**
 * Runs `work` while holding the run's compute lock, which can only be taken
 * on a draft. Recalculating, changing adjustments and submitting all go
 * through here, so two of them can't interleave, and nothing rewrites a
 * run's records once it has left draft (the lock can't be taken then).
 */
export async function withComputeLock<T>(runId: Types.ObjectId, work: (lock: string) => Promise<T>): Promise<T> {
  const lock = randomUUID();
  const now = new Date();
  const claimed = await PayrollRunModel.findOneAndUpdate(
    { _id: runId, status: "draft", ...NO_ACTIVE_LOCK(now) },
    { $set: { computeLock: lock, computeLockUntil: new Date(now.getTime() + COMPUTE_LOCK_MS) } },
  );
  if (!claimed) {
    const run = await PayrollRunModel.findById(runId).select("status").lean<{ status: string } | null>();
    if (!run) throw new NotFoundError("Payroll run not found");
    if (run.status !== "draft") throw new BusinessRuleError("This run is no longer a draft, so it can't be changed or recalculated. Return it to draft first.");
    throw new ConflictError("This run is being recalculated right now. Try again in a moment.");
  }
  try {
    return await work(lock);
  } finally {
    await PayrollRunModel.updateOne({ _id: runId, computeLock: lock }, { $unset: { computeLock: 1, computeLockUntil: 1 } });
  }
}
