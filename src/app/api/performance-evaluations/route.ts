import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { resolveEvaluationActor } from "@/domains/performance/evaluation-actor";
import { PerformanceEvaluationService } from "@/domains/performance/performance-evaluation-service";
import { createPerformanceEvaluationSchema } from "@/shared/validation/performance-evaluation";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    const { userId } = await requirePermission("performance-evaluations.read", organizationId);
    const actor = await resolveEvaluationActor(userId, organizationId);
    const employeeId = request.nextUrl.searchParams.get("employeeId") ?? undefined;
    const evaluations = await PerformanceEvaluationService.list(organizationId, actor, { employeeId });
    return NextResponse.json({ evaluations });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createPerformanceEvaluationSchema.parse(await request.json());
    const { userId } = await requirePermission("performance-evaluations.create", input.organizationId);
    const actor = await resolveEvaluationActor(userId, input.organizationId);
    const evaluation = await PerformanceEvaluationService.create(input, actor);
    return NextResponse.json({ evaluation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
