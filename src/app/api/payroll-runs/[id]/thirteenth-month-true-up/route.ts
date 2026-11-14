import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { thirteenthMonthTrueUpSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Adds last year's 13th-month true-up to a draft regular run (payroll plan Phase 3). Same permission as adjustments. */
export async function POST(request: Request, ctx: RouteContext<"/api/payroll-runs/[id]/thirteenth-month-true-up">) {
  try {
    const { id } = await ctx.params;
    const input = thirteenthMonthTrueUpSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-runs.update", input.organizationId);
    await enforceRateLimit("payrollCompute", userId);
    const result = await PayrollRunService.addThirteenthMonthTrueUp(id, input, { userId });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
