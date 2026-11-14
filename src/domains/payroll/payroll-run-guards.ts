// Lookups and guards shared by PayrollRunService: loading a run inside its
// organization, numbering, overlap checks and the compute lock.
import { randomUUID } from "crypto";
import { Types } from "mongoose";
import { PayrollRunModel } from "@/server/db/models";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { dateKeyToDate, dateToDateKey, formatDateRange } from "@/lib/date-key";
import { PAYROLL_RUN_TYPE_LABELS, runTypeOf, type PayrollRunType } from "./payroll-labels";

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

/** What the overlap rule needs to know about a run. */
export type RunKey = {
  runType?: string | null;
  projectId?: string | null;
  employeeId?: string | null;
  start: string;
  end: string;
};

/**
 * Whether two runs would pay the same people twice (Gate A of the payroll plan, approved 2026-11-14).
 * Runs of different types never conflict: a 13th-month, year-end or final run pays something a
 * regular run does not. Within one type:
 * - regular, 13th month, year-end: overlapping dates conflict, where an organization-wide run
 *   conflicts with any run and a project run with organization-wide runs and the same project;
 * - final: two final-pay runs for the same employee conflict, whatever their dates.
 */
export function runsConflict(a: RunKey, b: RunKey): boolean {
  const type = runTypeOf(a);
  if (type !== runTypeOf(b)) return false;
  if (type === "final") return !!a.employeeId && a.employeeId === b.employeeId;
  const datesOverlap = a.start <= b.end && b.start <= a.end;
  const scopesOverlap = !a.projectId || !b.projectId || a.projectId === b.projectId;
  return datesOverlap && scopesOverlap;
}

/**
 * The same people can't be paid twice for the same thing (see `runsConflict`). Cancelled runs don't count.
 * `createdBefore`: only runs created before this one count (the re-check after insert, see prepare).
 */
export async function assertNoOverlap(
  organizationId: string,
  projectId: string | undefined,
  start: string,
  end: string,
  createdBefore?: Types.ObjectId,
  kind: { runType?: PayrollRunType; employeeId?: string } = {},
) {
  const runType = kind.runType ?? "regular";
  const candidates = await PayrollRunModel.find({
    organizationId: new Types.ObjectId(organizationId),
    ...(createdBefore ? { _id: { $lt: createdBefore } } : {}),
    status: { $ne: "cancelled" },
    // Narrow by type in the query; runs saved before run types existed have none and are regular.
    runType: runType === "regular" ? { $in: [null, "regular"] } : runType,
    ...(runType === "final" ? { employeeId: kind.employeeId ? new Types.ObjectId(kind.employeeId) : null } : { payPeriodStart: { $lte: dateKeyToDate(end) }, payPeriodEnd: { $gte: dateKeyToDate(start) } }),
  }).lean();
  const mine: RunKey = { runType, projectId, employeeId: kind.employeeId, start, end };
  const conflict = candidates.find((run) =>
    runsConflict(mine, {
      runType: run.runType,
      projectId: run.projectId?.toString(),
      employeeId: run.employeeId?.toString(),
      start: dateToDateKey(run.payPeriodStart),
      end: dateToDateKey(run.payPeriodEnd),
    }),
  );
  if (conflict) {
    const what = runType === "final" ? "this employee's final pay" : `${formatDateRange(dateToDateKey(conflict.payPeriodStart), dateToDateKey(conflict.payPeriodEnd))} for these employees`;
    const label = runType === "regular" ? "" : ` (${PAYROLL_RUN_TYPE_LABELS[runType]})`;
    throw new ConflictError(`${conflict.runNumber}${label} already covers ${what}. Cancel it first to prepare another.`);
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
