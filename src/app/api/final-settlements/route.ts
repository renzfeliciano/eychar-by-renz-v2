import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { prepareFinalSettlementSchema } from "@/shared/validation/final-settlement";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Prepares (or recomputes, while a draft) the final settlement for a clearance case (ADR-032). */
export async function POST(request: NextRequest) {
  try {
    const input = prepareFinalSettlementSchema.parse(await request.json());
    const { userId } = await requirePermission("final-settlements.prepare", input.organizationId);
    const settlement = await FinalSettlementService.prepare(input.clearanceCaseId, input.organizationId, { userId });
    return NextResponse.json({ settlement }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
