import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PriorEmploymentService } from "@/domains/payroll/prior-employment-service";
import { priorEmploymentSchema } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/prior-employments/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = priorEmploymentSchema.parse(await request.json());
    const { userId } = await requirePermission("compensation.update", input.organizationId);
    const priorEmployment = await PriorEmploymentService.update(id, input, { userId });
    return NextResponse.json({ priorEmployment });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/prior-employments/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    const { userId } = await requirePermission("compensation.update", organizationId);
    await PriorEmploymentService.remove(id, organizationId, { userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
