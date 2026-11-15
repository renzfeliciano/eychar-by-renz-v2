import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { setBonusAmountSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Sets one employee's amount on a draft bonus run (0 leaves them out, null restores the computed amount). Same permission as adjustments. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/payroll-runs/[id]/bonus">) {
  try {
    const { id } = await ctx.params;
    const input = setBonusAmountSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-runs.update", input.organizationId);
    const run = await PayrollRunService.setBonusAmount(id, input, { userId });
    return NextResponse.json({ run });
  } catch (error) {
    return toErrorResponse(error);
  }
}
