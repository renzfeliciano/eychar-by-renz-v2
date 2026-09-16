import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { updatePayrollRuleVersionStatusSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/payroll-rule-versions/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updatePayrollRuleVersionStatusSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-rule-versions.update", input.organizationId);
    const ruleVersion = await PayrollRuleVersionService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ ruleVersion });
  } catch (error) {
    return toErrorResponse(error);
  }
}
