import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { adjustLeaveBalanceSchema } from "@/shared/validation/leave";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/leave-balances/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = adjustLeaveBalanceSchema.parse(await request.json());
    const { userId } = await requirePermission("leave-balances.update", input.organizationId);
    const leaveBalance = await LeaveBalanceService.adjust(id, input.organizationId, input, { userId });
    return NextResponse.json({ leaveBalance });
  } catch (error) {
    return toErrorResponse(error);
  }
}
