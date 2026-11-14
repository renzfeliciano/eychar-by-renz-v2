import { Types, type Model } from "mongoose";
import { ConflictError } from "@/shared/errors";
import { addDays, dateKeyToDate, dateToDateKey, formatDateKey } from "@/lib/date-key";

/**
 * Policies and rule versions resolve newest-`effectiveFrom`-wins (ENGINEERING §27). Two active rows
 * for the same scope starting on the same day leave that rule with no winner, so the second is
 * refused. A later start date is still the way to supersede a row.
 */
export async function assertNoSameDayVersion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared by two models with different schemas
  model: Model<any>,
  scope: { organizationId: string; projectId?: string | null; effectiveFrom: Date },
  label: string,
) {
  const dayKey = dateToDateKey(scope.effectiveFrom);
  const clash = await model.exists({
    organizationId: new Types.ObjectId(scope.organizationId),
    projectId: scope.projectId ? new Types.ObjectId(scope.projectId) : { $in: [null] },
    status: "active",
    effectiveFrom: { $gte: dateKeyToDate(dayKey), $lt: dateKeyToDate(addDays(dayKey, 1)) },
  });
  if (clash) {
    const where = scope.projectId ? "this project" : "the whole organization";
    throw new ConflictError(`An active ${label} for ${where} already starts on ${formatDateKey(dayKey)}. Pick a different start date, or deactivate the existing one first.`);
  }
}
