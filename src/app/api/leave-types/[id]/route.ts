import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { updateLeaveTypeStatusSchema, updateLeaveTypeSchema, deleteLeaveTypeSchema } from "@/shared/validation/leave";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Status-only patches (`{status}`) go through updateStatus; anything with a `name` is a full rename. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/leave-types/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = await request.json();

    if (typeof body?.convertibleAtSeparation === "boolean") {
      const { organizationId } = updateLeaveTypeStatusSchema.pick({ organizationId: true }).parse(body);
      const { userId } = await requirePermission("leave-types.update", organizationId);
      const leaveType = await LeaveTypeService.setConvertible(id, organizationId, body.convertibleAtSeparation, { userId });
      return NextResponse.json({ leaveType });
    }

    if (typeof body?.name === "string") {
      const input = updateLeaveTypeSchema.parse(body);
      const { userId } = await requirePermission("leave-types.update", input.organizationId);
      const leaveType = await LeaveTypeService.update(id, input.organizationId, input, { userId });
      return NextResponse.json({ leaveType });
    }

    const input = updateLeaveTypeStatusSchema.parse(body);
    const { userId } = await requirePermission("leave-types.update", input.organizationId);
    const leaveType = await LeaveTypeService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ leaveType });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/leave-types/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = deleteLeaveTypeSchema.parse(await request.json());
    const { userId } = await requirePermission("leave-types.delete", input.organizationId);
    await LeaveTypeService.delete(id, input.organizationId, { userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
