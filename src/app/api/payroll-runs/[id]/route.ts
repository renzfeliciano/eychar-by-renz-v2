import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { payrollRunActionSchema, type PayrollRunActionInput } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

// Preparing and correcting a run, approving it, and paying it out are separate permissions.
const PERMISSION_BY_ACTION: Record<PayrollRunActionInput["action"], string> = {
  recompute: "payroll-runs.update",
  submit: "payroll-runs.update",
  cancel: "payroll-runs.update",
  approve: "payroll.approve",
  return: "payroll.approve",
  release: "payroll.release",
};

export async function GET(request: NextRequest, ctx: RouteContext<"/api/payroll-runs/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    await requirePermission("payroll-runs.read", organizationId);
    const detail = await PayrollRunService.getDetail(id, organizationId);
    return NextResponse.json({ detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Moves a run through its lifecycle: recompute, submit, approve, return, release or cancel. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/payroll-runs/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = payrollRunActionSchema.parse(await request.json());
    const { userId } = await requirePermission(PERMISSION_BY_ACTION[input.action], input.organizationId);
    const run = await PayrollRunService.act(id, input, { userId });
    return NextResponse.json({ run });
  } catch (error) {
    return toErrorResponse(error);
  }
}
