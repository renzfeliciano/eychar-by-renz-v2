import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { resolveEvaluationActor } from "@/domains/performance/evaluation-actor";
import { PerformanceEvaluationService } from "@/domains/performance/performance-evaluation-service";
import { submitPerformanceEvaluationSchema } from "@/shared/validation/performance-evaluation";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: Request, ctx: RouteContext<"/api/performance-evaluations/[id]/submit">) {
  try {
    const { id } = await ctx.params;
    const input = submitPerformanceEvaluationSchema.parse(await request.json());
    const { userId } = await requirePermission("performance-evaluations.update", input.organizationId);
    const actor = await resolveEvaluationActor(userId, input.organizationId);
    const evaluation = await PerformanceEvaluationService.submit(id, input.organizationId, input, actor);
    return NextResponse.json({ evaluation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
