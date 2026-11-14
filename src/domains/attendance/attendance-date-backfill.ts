import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { dateToDateKey } from "@/lib/date-key";
import { appCalendarDate } from "./attendance-service";

export type AttendanceDateMove = { recordId: string; employeeId: string; from: string; to: string };
export type AttendanceDateCollision = AttendanceDateMove & { existingRecordId: string | null };

export type AttendanceDateBackfillReport = {
  scanned: number;
  alreadyCorrect: number;
  /** No check-in instant: nothing to derive the day from, left as it is. */
  withoutCheckIn: number;
  toMove: number;
  moved: number;
  moves: AttendanceDateMove[];
  /** The employee already has a record on the target day: reported, neither record touched. */
  collisions: AttendanceDateCollision[];
};

type RecordLean = { _id: Types.ObjectId; organizationId: Types.ObjectId; employeeId: Types.ObjectId; date: Date; checkInAt?: Date | null };

/**
 * Gap B3 / plan item 1b: records written before the clock used the
 * organization's calendar day were filed under the UTC day, so a clock-in
 * between 00:00 and 08:00 Manila sits on the previous day. This re-derives
 * each record's day from its own check-in instant in the app zone
 * (appCalendarDate, the rule new records follow).
 *
 * Dry run unless `apply`. Idempotent: a corrected record is "already
 * correct" on the next run. Never deletes or overwrites: when the employee
 * already has a record on the target day, both are left alone and the pair
 * is reported for HR to resolve. Each move is audited.
 */
export async function backfillAttendanceDates(options: {
  apply: boolean;
  organizationId?: string;
  log?: (line: string) => void;
}): Promise<AttendanceDateBackfillReport> {
  await connectMongoDB();
  const log = options.log ?? (() => undefined);
  const filter: Record<string, unknown> = {};
  if (options.organizationId) filter.organizationId = new Types.ObjectId(options.organizationId);

  // Newest first: the app zone is ahead of UTC, so every move is one day
  // later. Someone who always clocks in just after midnight has each record
  // sitting on the day the previous one belongs to; moving the latest first
  // frees each target day before the next record needs it.
  const records = await AttendanceRecordModel.find(filter)
    .select("organizationId employeeId date checkInAt")
    .sort({ date: -1, _id: 1 })
    .lean<RecordLean[]>();

  // Who sits on which day, kept up to date as records move (also in a dry
  // run), so the dry run reports exactly what the real run will do.
  const slot = (record: { organizationId: Types.ObjectId; employeeId: Types.ObjectId }, date: Date) => `${record.organizationId.toString()}|${record.employeeId.toString()}|${date.getTime()}`;
  const occupant = new Map(records.map((record) => [slot(record, record.date), record._id.toString()]));

  const report: AttendanceDateBackfillReport = { scanned: records.length, alreadyCorrect: 0, withoutCheckIn: 0, toMove: 0, moved: 0, moves: [], collisions: [] };

  for (const record of records) {
    if (!record.checkInAt) {
      report.withoutCheckIn += 1;
      continue;
    }
    const target = appCalendarDate(record.checkInAt);
    if (target.getTime() === record.date.getTime()) {
      report.alreadyCorrect += 1;
      continue;
    }

    report.toMove += 1;
    const move: AttendanceDateMove = { recordId: record._id.toString(), employeeId: record.employeeId.toString(), from: dateToDateKey(record.date), to: dateToDateKey(target) };
    const existing = occupant.get(slot(record, target));
    if (existing) {
      report.collisions.push({ ...move, existingRecordId: existing });
      log(`COLLISION ${move.recordId} (employee ${move.employeeId}) ${move.from} -> ${move.to}: record ${existing} already on ${move.to}`);
      continue;
    }

    report.moves.push(move);
    occupant.delete(slot(record, record.date));
    occupant.set(slot(record, target), move.recordId);
    log(`${options.apply ? "MOVE" : "WOULD MOVE"} ${move.recordId} (employee ${move.employeeId}) ${move.from} -> ${move.to}`);
    if (!options.apply) continue;

    try {
      // Only if the record is still where we read it (another run or an edit may have moved it).
      const result = await AttendanceRecordModel.updateOne({ _id: record._id, date: record.date }, { $set: { date: target } });
      if (result.modifiedCount === 0) continue;
    } catch (error) {
      // Another record landed on the target day between the check and the write.
      if (isDuplicateKeyError(error)) {
        report.moves.pop();
        report.collisions.push({ ...move, existingRecordId: null });
        log(`COLLISION ${move.recordId}: a record appeared on ${move.to} during the run`);
        continue;
      }
      throw error;
    }
    report.moved += 1;
    await AuditService.record({
      organizationId: record.organizationId.toString(),
      action: "attendance.date_corrected",
      resourceType: "AttendanceRecord",
      resourceId: move.recordId,
      before: { date: move.from },
      after: { date: move.to },
      metadata: { reason: "Calendar day re-derived from check-in in the organization's time zone (gap B3)", checkInAt: record.checkInAt },
    });
  }

  return report;
}
