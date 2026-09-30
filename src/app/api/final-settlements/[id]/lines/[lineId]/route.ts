import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/final-settlements/[id]/lines/[lineId]">) {
  try {
    const { id, lineId } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    const { userId } = await requirePermission("final-settlements.prepare", organizationId);
    const settlement = await FinalSettlementService.removeManualLine(id, organizationId, lineId, { userId });
    return NextResponse.json({ settlement });
  } catch (error) {
    return toErrorResponse(error);
  }
}
