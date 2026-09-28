import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { createPayrollRunSchema } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    await requirePermission("payroll-runs.read", organizationId);
    const runs = await PayrollRunService.list(organizationId);
    return NextResponse.json({ runs });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Prepares a draft run for a scope (the organization or one project) and period. */
export async function POST(request: NextRequest) {
  try {
    const input = createPayrollRunSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-runs.create", input.organizationId);
    const run = await PayrollRunService.prepare(input, { userId });
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
