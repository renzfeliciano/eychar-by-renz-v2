import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ShiftTemplateService } from "@/domains/attendance/shift-template-service";
import { updateShiftTemplateSchema } from "@/shared/validation/schedule";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/attendance/shifts/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId, status, ...patch } = updateShiftTemplateSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", organizationId);
    const shift = status
      ? await ShiftTemplateService.updateStatus(id, organizationId, { status }, { userId })
      : await ShiftTemplateService.update(id, organizationId, patch, { userId });
    return NextResponse.json({ shift });
  } catch (error) {
    return toErrorResponse(error);
  }
}
