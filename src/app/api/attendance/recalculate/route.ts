import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { DayResultService } from "@/domains/attendance/day-result";
import { recalculateAttendanceSchema } from "@/shared/validation/attendance";
import { toErrorResponse } from "@/shared/errors/to-response";

/**
 * Re-measures stored day results over a range (plan Phase 3). Its own
 * permission (owner decision 11), not attendance.update, which shift
 * templates and the holiday calendar already share. Org-wide only.
 */
export async function POST(request: Request) {
  try {
    const input = recalculateAttendanceSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.recalculate", input.organizationId);
    const result = await DayResultService.recalculate(input, { userId });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
