import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PayrollService } from "@/domains/payroll/payroll-service";
import { decidePayrollRunSchema } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/payroll-runs/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("payroll-runs.read", organizationId);
    const detail = await PayrollService.getRunDetail(id, organizationId);
    return NextResponse.json({ detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/payroll-runs/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = decidePayrollRunSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll.approve", input.organizationId);
    const run = await PayrollService.approve(id, input.organizationId, { userId });
    return NextResponse.json({ run });
  } catch (error) {
    return toErrorResponse(error);
  }
}
