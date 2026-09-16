import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { updateOrganizationEntityStatusSchema } from "@/shared/validation/organization-structure";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/organization-units/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateOrganizationEntityStatusSchema.parse(await request.json());
    const { userId } = await requirePermission("organization-units.update", input.organizationId);
    const unit = await OrganizationUnitService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ unit });
  } catch (error) {
    return toErrorResponse(error);
  }
}
