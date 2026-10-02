import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeAssignmentModel } from "@/server/db/models";

type AssignmentLean = {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
};

/**
 * `EmployeeAssignmentService.getAsOf` for many (employee, instant) pairs in
 * one query: every assignment of those employees that started by the latest
 * instant, then resolved per pair in memory with getAsOf's own rule (started
 * on or before the instant, not closed before it). Where two rows match (a
 * transfer's close and open share the same instant), the earlier-started one
 * wins, which is the order getAsOf's `{ employeeId, effectiveFrom }` index
 * scan returns them in.
 */
export async function assignmentsAsOf(pairs: { employeeId: string; date: Date }[]): Promise<(AssignmentLean | null)[]> {
  if (pairs.length === 0) return [];
  await connectMongoDB();
  const employeeIds = [...new Set(pairs.map((pair) => pair.employeeId))].map((id) => new Types.ObjectId(id));
  const latest = new Date(pairs.reduce((max, pair) => Math.max(max, pair.date.getTime()), -Infinity));
  const assignments = await EmployeeAssignmentModel.find({ employeeId: { $in: employeeIds }, effectiveFrom: { $lte: latest } })
    .select({ employeeId: 1, projectId: 1, effectiveFrom: 1, effectiveTo: 1 })
    .sort({ employeeId: 1, effectiveFrom: 1, _id: 1 })
    .lean<AssignmentLean[]>();

  const byEmployee = new Map<string, AssignmentLean[]>();
  for (const assignment of assignments) {
    const key = assignment.employeeId.toString();
    const list = byEmployee.get(key);
    if (list) list.push(assignment);
    else byEmployee.set(key, [assignment]);
  }

  return pairs.map(({ employeeId, date }) => {
    const time = date.getTime();
    return (
      byEmployee
        .get(employeeId)
        ?.find((assignment) => assignment.effectiveFrom.getTime() <= time && (assignment.effectiveTo == null || assignment.effectiveTo.getTime() >= time)) ?? null
    );
  });
}
