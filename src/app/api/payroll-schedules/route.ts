import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { createPayrollScheduleSchema } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    await requirePermission("payroll-schedules.read", organizationId);
    const schedules = await PayrollScheduleService.list(organizationId);
    return NextResponse.json({ schedules });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createPayrollScheduleSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-schedules.create", input.organizationId);
    const schedule = await PayrollScheduleService.create(input, { userId });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
