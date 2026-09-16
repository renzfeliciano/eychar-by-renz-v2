import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { reviseCompensationSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/compensation/[employeeId]">) {
  try {
    const { employeeId } = await ctx.params;
    const input = reviseCompensationSchema.parse(await request.json());
    const { userId } = await requirePermission("compensation.update", input.organizationId);
    const compensation = await CompensationService.revise(employeeId, input.organizationId, input, { userId });
    return NextResponse.json({ compensation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
