import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { updateLeaveTypeStatusSchema } from "@/shared/validation/leave";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/leave-types/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateLeaveTypeStatusSchema.parse(await request.json());
    const { userId } = await requirePermission("leave-types.update", input.organizationId);
    const leaveType = await LeaveTypeService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ leaveType });
  } catch (error) {
    return toErrorResponse(error);
  }
}
