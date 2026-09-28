import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { updatePayrollScheduleSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/payroll-schedules/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updatePayrollScheduleSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-schedules.update", input.organizationId);
    const schedule = await PayrollScheduleService.update(id, input, { userId });
    return NextResponse.json({ schedule });
  } catch (error) {
    return toErrorResponse(error);
  }
}
