import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ReviewCycleService } from "@/domains/performance/review-cycle-service";
import { createReviewCycleSchema } from "@/shared/validation/performance";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("review-cycles.read", organizationId);
    const cycles = await ReviewCycleService.listCurrent(organizationId);
    return NextResponse.json({ cycles });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createReviewCycleSchema.parse(await request.json());
    const { userId } = await requirePermission("review-cycles.create", input.organizationId);
    const cycle = await ReviewCycleService.create(input, { userId });
    return NextResponse.json({ cycle }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
