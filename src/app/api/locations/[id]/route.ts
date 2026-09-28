import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LocationService } from "@/domains/organization/location-service";
import { updateLocationSchema } from "@/shared/validation/organization-structure";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/locations/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId, status, ...patch } = updateLocationSchema.parse(await request.json());
    const { userId } = await requirePermission("locations.update", organizationId);
    const location = status
      ? await LocationService.updateStatus(id, organizationId, { status }, { userId })
      : await LocationService.update(id, organizationId, patch, { userId });
    return NextResponse.json({ location });
  } catch (error) {
    return toErrorResponse(error);
  }
}
