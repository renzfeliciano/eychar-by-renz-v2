import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PerformanceReviewService } from "@/domains/performance/performance-review-service";
import { submitPerformanceReviewSchema } from "@/shared/validation/performance";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/performance-reviews/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = submitPerformanceReviewSchema.parse(await request.json());
    const { userId } = await requirePermission("performance-reviews.update", input.organizationId);
    const review = await PerformanceReviewService.submit(id, input.organizationId, input, { userId });
    return NextResponse.json({ review });
  } catch (error) {
    return toErrorResponse(error);
  }
}
