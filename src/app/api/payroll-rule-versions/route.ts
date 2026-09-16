import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { createPayrollRuleVersionSchema } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("payroll-rule-versions.read", organizationId);
    const ruleVersions = await PayrollRuleVersionService.listCurrent(organizationId);
    return NextResponse.json({ ruleVersions });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createPayrollRuleVersionSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-rule-versions.create", input.organizationId);
    const ruleVersion = await PayrollRuleVersionService.create(input, { userId });
    return NextResponse.json({ ruleVersion }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
