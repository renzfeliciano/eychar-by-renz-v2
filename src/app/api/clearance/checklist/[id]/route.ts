import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ClearanceChecklistService } from "@/domains/clearance/clearance-checklist-service";
import { updateChecklistItemSchema } from "@/shared/validation/clearance";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/clearance/checklist/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId, ...patch } = updateChecklistItemSchema.parse(await request.json());
    const { userId } = await requirePermission("clearance.update", organizationId);
    const item = await ClearanceChecklistService.update(id, organizationId, patch, { userId });
    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error);
  }
}
