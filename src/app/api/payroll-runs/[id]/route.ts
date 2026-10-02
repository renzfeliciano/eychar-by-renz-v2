import { enforceRateLimit } from "@/server/security/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { includesProject, requireAccessibleProjects, requirePermission } from "@/server/authorization";
import { NotFoundError } from "@/shared/errors";
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
    const { projects } = await requireAccessibleProjects("payroll-runs.read", organizationId);
    const detail = await PayrollRunService.getDetail(id, organizationId);
    // A project-scoped reader only opens their projects' runs; anything else reads as not found, like the list.
    if (!includesProject(projects, detail.run.projectId)) throw new NotFoundError("Payroll run not found in this organization");
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
    if (input.action === "recompute" || input.action === "submit") await enforceRateLimit("payrollCompute", userId);
    const run = await PayrollRunService.act(id, input, { userId });
    return NextResponse.json({ run });
  } catch (error) {
    return toErrorResponse(error);
  }
}
