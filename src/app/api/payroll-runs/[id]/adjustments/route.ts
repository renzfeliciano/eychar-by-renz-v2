import { enforceRateLimit } from "@/server/security/rate-limit";
import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { payrollAdjustmentSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: Request, ctx: RouteContext<"/api/payroll-runs/[id]/adjustments">) {
  try {
    const { id } = await ctx.params;
    const input = payrollAdjustmentSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-runs.update", input.organizationId);
    await enforceRateLimit("payrollCompute", userId);
    const adjustment = await PayrollRunService.addAdjustment(id, input, { userId });
    return NextResponse.json({ adjustment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
