import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollService } from "@/domains/payroll/payroll-service";
import { generatePayrollRunSchema } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("payroll-runs.read", organizationId);
    const runs = await PayrollService.listRuns(organizationId);
    return NextResponse.json({ runs });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = generatePayrollRunSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-runs.create", input.organizationId);
    const { run, records } = await PayrollService.generateRun(input, { userId });
    return NextResponse.json({ run, records }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
