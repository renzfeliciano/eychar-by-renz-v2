import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { decideLeaveRequestSchema } from "@/shared/validation/leave";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/leave-requests/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = decideLeaveRequestSchema.parse(await request.json());

    if (input.action === "cancel") {
      const { userId } = await requirePermission("leave.update", input.organizationId);
      const leaveRequest = await LeaveRequestService.cancel(id, input.organizationId, { userId });
      return NextResponse.json({ request: leaveRequest });
    }

    const { userId } = await requirePermission("leave.approve", input.organizationId);
    const leaveRequest = await LeaveRequestService.decide(
      id,
      input.organizationId,
      { decision: input.action === "approve" ? "approved" : "rejected", rejectionReason: input.rejectionReason },
      { userId },
    );
    return NextResponse.json({ request: leaveRequest });
  } catch (error) {
    return toErrorResponse(error);
  }
}
