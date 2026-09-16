import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PerformanceReviewService } from "@/domains/performance/performance-review-service";
import { createPerformanceReviewSchema } from "@/shared/validation/performance";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { BusinessRuleError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("performance-reviews.read", organizationId);

    const reviewCycleId = request.nextUrl.searchParams.get("reviewCycleId");
    const employeeId = request.nextUrl.searchParams.get("employeeId");
    if (!reviewCycleId && !employeeId) {
      throw new BusinessRuleError("reviewCycleId or employeeId is required");
    }

    const reviews = reviewCycleId
      ? await PerformanceReviewService.listForCycle(reviewCycleId, organizationId)
      : await PerformanceReviewService.listForEmployee(employeeId!, organizationId);

    return NextResponse.json({ reviews });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createPerformanceReviewSchema.parse(await request.json());
    const { userId } = await requirePermission("performance-reviews.create", input.organizationId);
    const review = await PerformanceReviewService.create(input, { userId });
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
