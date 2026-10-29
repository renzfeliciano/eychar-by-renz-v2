import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EvaluationFollowUpService } from "@/domains/performance/evaluation-follow-up-service";
import { recordEvaluationFollowUpSchema } from "@/shared/validation/performance";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Record a probation evaluation as sent or completed outside PCAS HRIS (ADR-053). */
export async function POST(request: NextRequest) {
  try {
    const input = recordEvaluationFollowUpSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    const followUp = await EvaluationFollowUpService.record(input, { userId });
    return NextResponse.json({ followUp: { id: followUp._id.toString(), outcome: followUp.outcome } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
