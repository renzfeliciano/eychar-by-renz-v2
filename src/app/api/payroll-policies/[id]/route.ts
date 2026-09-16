import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { updatePayrollPolicyStatusSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/payroll-policies/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updatePayrollPolicyStatusSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-policies.update", input.organizationId);
    const policy = await PayrollPolicyService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ policy });
  } catch (error) {
    return toErrorResponse(error);
  }
}
