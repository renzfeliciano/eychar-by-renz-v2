import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

/** "Prepare due runs now" on the schedules screen: the same idempotent pass the daily cron makes. */
export async function POST(request: Request) {
  try {
    const { organizationId } = organizationIdParamSchema.parse(await request.json());
    await requirePermission("payroll-runs.create", organizationId);
    const outcomes = await PayrollScheduleService.prepareDue({ organizationId });
    return NextResponse.json({ outcomes });
  } catch (error) {
    return toErrorResponse(error);
  }
}
