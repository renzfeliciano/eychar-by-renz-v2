import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { AttendancePolicyService } from "@/domains/attendance/attendance-policy-service";
import { updateOrganizationEntityStatusSchema } from "@/shared/validation/organization-structure";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/attendance-policies/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateOrganizationEntityStatusSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance-policies.update", input.organizationId);
    const policy = await AttendancePolicyService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ policy });
  } catch (error) {
    return toErrorResponse(error);
  }
}
