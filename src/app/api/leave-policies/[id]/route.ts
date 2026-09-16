import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LeavePolicyService } from "@/domains/leave/leave-policy-service";
import { updateLeavePolicyStatusSchema } from "@/shared/validation/leave";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/leave-policies/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateLeavePolicyStatusSchema.parse(await request.json());
    const { userId } = await requirePermission("leave-policies.update", input.organizationId);
    const leavePolicy = await LeavePolicyService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ leavePolicy });
  } catch (error) {
    return toErrorResponse(error);
  }
}
