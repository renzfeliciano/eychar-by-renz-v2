import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { manualLineSchema } from "@/shared/validation/final-settlement";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Adds a manual earning or deduction (bonus, reimbursement, loan…) with its reason. */
export async function POST(request: Request, ctx: RouteContext<"/api/final-settlements/[id]/lines">) {
  try {
    const { id } = await ctx.params;
    const { organizationId, ...input } = manualLineSchema.parse(await request.json());
    const { userId } = await requirePermission("final-settlements.prepare", organizationId);
    const settlement = await FinalSettlementService.addManualLine(id, organizationId, input, { userId });
    return NextResponse.json({ settlement }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
