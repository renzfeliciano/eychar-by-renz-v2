import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EvaluationFollowUpService } from "@/domains/performance/evaluation-follow-up-service";
import { withdrawEvaluationFollowUpSchema } from "@/shared/validation/performance";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Undo a follow-up: kept as withdrawn, and the dashboard row returns (ADR-053). */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/evaluation-follow-ups/[id]">) {
  try {
    const id = objectId().parse((await ctx.params).id);
    const input = withdrawEvaluationFollowUpSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    await EvaluationFollowUpService.withdraw(id, input.organizationId, { userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
