import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployerTaxService } from "@/domains/payroll/employer-tax-service";
import { employerTaxSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";

/** The employer's BIR details for Form 2316 (payroll plan Phase 4). Payroll configuration: payroll-policy permissions. */
export async function PATCH(request: NextRequest) {
  try {
    const input = employerTaxSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-policies.update", input.organizationId);
    const tax = await EmployerTaxService.update(input, { userId });
    return NextResponse.json({ tax });
  } catch (error) {
    return toErrorResponse(error);
  }
}
