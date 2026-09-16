import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { createPayrollPolicySchema } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("payroll-policies.read", organizationId);
    const policies = await PayrollPolicyService.listCurrent(organizationId);
    return NextResponse.json({ policies });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createPayrollPolicySchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-policies.create", input.organizationId);
    const policy = await PayrollPolicyService.create(input, { userId });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
