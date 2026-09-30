import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { finalSettlementActionSchema } from "@/shared/validation/final-settlement";
import { toErrorResponse } from "@/shared/errors/to-response";

const PERMISSION = {
  submit: "final-settlements.prepare",
  cancel: "final-settlements.prepare",
  review: "final-settlements.review",
  approve: "final-settlements.approve",
  return: "final-settlements.review",
  disburse: "final-settlements.disburse",
} as const;

/** Moves a settlement through submit → review → approve → disburse (or return / cancel). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/final-settlements/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId, ...input } = finalSettlementActionSchema.parse(await request.json());
    const { userId } = await requirePermission(PERMISSION[input.action], organizationId);
    const settlement = await FinalSettlementService.act(id, organizationId, input, { userId });
    return NextResponse.json({ settlement });
  } catch (error) {
    return toErrorResponse(error);
  }
}
