import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/payroll-runs/[id]/adjustments/[adjustmentId]">) {
  try {
    const { id, adjustmentId } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    const { userId } = await requirePermission("payroll-runs.update", organizationId);
    await PayrollRunService.removeAdjustment(id, adjustmentId, organizationId, { userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
