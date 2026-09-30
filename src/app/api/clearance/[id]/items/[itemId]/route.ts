import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { clearanceItemActionSchema } from "@/shared/validation/clearance";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Clear, flag, waive, mark not applicable, or reopen one checklist item. Waiving needs its own permission. */
export async function POST(request: Request, ctx: RouteContext<"/api/clearance/[id]/items/[itemId]">) {
  try {
    const { id, itemId } = await ctx.params;
    const { organizationId, ...input } = clearanceItemActionSchema.parse(await request.json());
    const { userId } = await requirePermission(input.action === "waive" ? "clearance.waive" : "clearance.sign-off", organizationId);
    const clearance = await ClearanceService.actOnItem(id, organizationId, itemId, input, { userId });
    return NextResponse.json({ clearance });
  } catch (error) {
    return toErrorResponse(error);
  }
}
