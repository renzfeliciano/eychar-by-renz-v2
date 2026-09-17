import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { RoleService } from "@/domains/authorization/role-service";
import { updateRoleSchema } from "@/shared/validation/roles";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/roles/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateRoleSchema.parse(await request.json());
    const { userId } = await requirePermission("roles.update", input.organizationId);
    const role = await RoleService.update(id, input.organizationId, input, { userId });
    return NextResponse.json({ role });
  } catch (error) {
    return toErrorResponse(error);
  }
}
