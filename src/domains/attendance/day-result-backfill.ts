import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { buildDayResult, dayResultSummary, type DayResultSource } from "./day-result";

export type DayResultBackfillReport = {
  /** Records without a stored day result. */
  scanned: number;
  filled: number;
  /** How many of the scanned records each flag would apply to. */
  flagCounts: Record<string, number>;
};

/**
 * Fills the stored day result on records written before it existed (plan
 * Phase 3). Only from stored data: the policy stored on the record (the one
 * its status was judged against; else the one in force on its date, never
 * today's), the day's schedule snapshot and the payroll policy for that date.
 * Dry run unless `apply`. Idempotent: a record that has a result is never
 * touched, so a second run finds nothing. Each fill is audited.
 */
export async function backfillDayResults(options: { apply: boolean; organizationId?: string; log?: (line: string) => void }): Promise<DayResultBackfillReport> {
  await connectMongoDB();
  const log = options.log ?? (() => undefined);
  const filter: Record<string, unknown> = { dayResult: { $exists: false } };
  if (options.organizationId) filter.organizationId = new Types.ObjectId(options.organizationId);

  const records = await AttendanceRecordModel.find(filter)
    .select("organizationId employeeId date checkInAt checkOutAt projectId policyId overtimeApproved")
    .sort({ date: 1, _id: 1 })
    .lean<(DayResultSource & { _id: Types.ObjectId })[]>();

  const report: DayResultBackfillReport = { scanned: records.length, filled: 0, flagCounts: {} };
  for (const record of records) {
    const result = await buildDayResult(record);
    for (const flag of result.flags) report.flagCounts[flag] = (report.flagCounts[flag] ?? 0) + 1;
    log(`${options.apply ? "FILL" : "WOULD FILL"} ${record._id.toString()} ${result.dayType} worked ${result.workedMinutes} late ${result.lateMinutes} OT ${result.overtimeMinutes}${result.flags.length ? ` [${result.flags.join(", ")}]` : ""}`);
    if (!options.apply) continue;

    const saved = await AttendanceRecordModel.updateOne({ _id: record._id, dayResult: { $exists: false } }, { $set: { dayResult: result } });
    if (saved.modifiedCount === 0) continue;
    report.filled += 1;
    await AuditService.record({
      organizationId: record.organizationId.toString(),
      action: "attendance.recalculated",
      resourceType: "AttendanceRecord",
      resourceId: record._id.toString(),
      before: null,
      after: dayResultSummary(result),
      metadata: { reason: "Backfill of the stored day result (plan Phase 3)" },
    });
  }
  return report;
}
