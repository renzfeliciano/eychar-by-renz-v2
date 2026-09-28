import { Types } from "mongoose";
import { EmployeeAssignmentModel } from "@/server/db/models";
import { dateKeyToDate } from "@/lib/date-key";

/**
 * Each employee's project as of a calendar day: the assignment that started
 * most recently on or before the end of that day. A transfer closes the old
 * assignment at the exact moment the new one starts, so the latest start
 * wins cleanly.
 */
export async function projectsAsOf(employeeIds: string[], dateKey: string): Promise<Map<string, string | null>> {
  const endOfDay = new Date(dateKeyToDate(dateKey).getTime() + 86_399_999);
  const assignments = await EmployeeAssignmentModel.find({
    employeeId: { $in: employeeIds.map((id) => new Types.ObjectId(id)) },
    effectiveFrom: { $lte: endOfDay },
  })
    .sort({ effectiveFrom: 1 })
    .lean();

  const projectByEmployee = new Map<string, string | null>();
  for (const assignment of assignments) {
    projectByEmployee.set(assignment.employeeId.toString(), assignment.projectId?.toString() ?? null);
  }
  return projectByEmployee;
}
