import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LocationService } from "@/domains/organization/location-service";
import { updateOrganizationEntityStatusSchema } from "@/shared/validation/organization-structure";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/locations/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateOrganizationEntityStatusSchema.parse(await request.json());
    if (!input.status) throw new Error("status is required");
    const { userId } = await requirePermission("locations.update", input.organizationId);
    const location = await LocationService.updateStatus(
      id,
      input.organizationId,
      { status: input.status },
      { userId },
    );
    return NextResponse.json({ location });
  } catch (error) {
    return toErrorResponse(error);
  }
}
