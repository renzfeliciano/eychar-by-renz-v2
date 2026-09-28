import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ScheduleService } from "@/domains/attendance/schedule-service";
import { saveScheduleEntriesSchema } from "@/shared/validation/schedule";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Sets (or, with shiftTemplateId: null, clears) a batch of employee-days in one call. */
export async function PUT(request: NextRequest) {
  try {
    const input = saveScheduleEntriesSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", input.organizationId);
    const result = await ScheduleService.saveEntries(input.organizationId, input.entries, { userId });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
