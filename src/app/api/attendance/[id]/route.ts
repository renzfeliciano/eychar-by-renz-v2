import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { adjustAttendanceSchema } from "@/shared/validation/attendance";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/attendance/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = adjustAttendanceSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", input.organizationId);
    const record = await AttendanceService.adjust(id, input.organizationId, input, { userId });
    return NextResponse.json({ record });
  } catch (error) {
    return toErrorResponse(error);
  }
}
