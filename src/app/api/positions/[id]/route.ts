import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PositionService } from "@/domains/organization/position-service";
import { updateOrganizationEntityStatusSchema } from "@/shared/validation/organization-structure";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/positions/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateOrganizationEntityStatusSchema.parse(await request.json());
    const { userId } = await requirePermission("positions.update", input.organizationId);
    const position = await PositionService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ position });
  } catch (error) {
    return toErrorResponse(error);
  }
}
