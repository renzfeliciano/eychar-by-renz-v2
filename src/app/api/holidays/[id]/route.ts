import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { HolidayService } from "@/domains/holidays/holiday-service";
import { cancelHolidaySchema, updateHolidaySchema } from "@/shared/validation/holidays";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/holidays/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateHolidaySchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", input.organizationId);
    const holiday = await HolidayService.update(id, input.organizationId, input, { userId });
    return NextResponse.json({ holiday });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Removes the holiday from the calendar (kept as cancelled, never hard-deleted). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/holidays/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = cancelHolidaySchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", input.organizationId);
    const holiday = await HolidayService.cancel(id, input.organizationId, { userId });
    return NextResponse.json({ holiday });
  } catch (error) {
    return toErrorResponse(error);
  }
}
