import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { createYearEndRunSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";
import { enforceRateLimit } from "@/server/security/rate-limit";

/** Prepares the year-end tax reconciliation run for a year (payroll plan Phase 4). Same permission as any new run. */
export async function POST(request: NextRequest) {
  try {
    const input = createYearEndRunSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-runs.create", input.organizationId);
    await enforceRateLimit("payrollRun", userId);
    const run = await PayrollRunService.prepareYearEnd(input, { userId });
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
