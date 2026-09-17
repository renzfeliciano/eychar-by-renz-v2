import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { revokeRoleAssignmentSchema } from "@/shared/validation/roles";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function DELETE(request: Request, ctx: RouteContext<"/api/role-assignments/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = revokeRoleAssignmentSchema.parse(await request.json());
    const { userId } = await requirePermission("roles.assign", input.organizationId);
    const assignment = await RoleAssignmentService.revoke(id, input.organizationId, { userId });
    return NextResponse.json({ assignment });
  } catch (error) {
    return toErrorResponse(error);
  }
}
