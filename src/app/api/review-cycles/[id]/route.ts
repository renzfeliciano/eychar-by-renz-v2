import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ReviewCycleService } from "@/domains/performance/review-cycle-service";
import { updateReviewCycleStatusSchema } from "@/shared/validation/performance";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/review-cycles/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateReviewCycleStatusSchema.parse(await request.json());
    const { userId } = await requirePermission("review-cycles.update", input.organizationId);
    const cycle = await ReviewCycleService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ cycle });
  } catch (error) {
    return toErrorResponse(error);
  }
}
