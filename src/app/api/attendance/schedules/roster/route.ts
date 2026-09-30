import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ScheduleService } from "@/domains/attendance/schedule-service";
import { scheduleRosterSchema } from "@/shared/validation/schedule";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Puts employees on or takes them off the monthly schedule (same permission as planning it, ADR-027). */
export async function PUT(request: NextRequest) {
  try {
    const input = scheduleRosterSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", input.organizationId);
    const result = await ScheduleService.setRosterMembership(input.organizationId, input.changes, { userId });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
