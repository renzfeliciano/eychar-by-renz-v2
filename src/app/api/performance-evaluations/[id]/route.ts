import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { resolveEvaluationActor } from "@/domains/performance/evaluation-actor";
import { PerformanceEvaluationService } from "@/domains/performance/performance-evaluation-service";
import { savePerformanceEvaluationSchema } from "@/shared/validation/performance-evaluation";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/performance-evaluations/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    const { userId } = await requirePermission("performance-evaluations.read", organizationId);
    const actor = await resolveEvaluationActor(userId, organizationId);
    return NextResponse.json(await PerformanceEvaluationService.getDetail(id, organizationId, actor));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/performance-evaluations/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = savePerformanceEvaluationSchema.parse(await request.json());
    const { userId } = await requirePermission("performance-evaluations.update", input.organizationId);
    const actor = await resolveEvaluationActor(userId, input.organizationId);
    const evaluation = await PerformanceEvaluationService.saveDraft(id, input.organizationId, input, actor);
    return NextResponse.json({ evaluation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
