import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { cancelClearanceSchema } from "@/shared/validation/clearance";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Cancels a clearance (for example, a withdrawn resignation). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/clearance/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId, reason } = cancelClearanceSchema.parse(await request.json());
    const { userId } = await requirePermission("clearance.update", organizationId);
    const clearance = await ClearanceService.cancel(id, organizationId, { reason }, { userId });
    return NextResponse.json({ clearance });
  } catch (error) {
    return toErrorResponse(error);
  }
}
