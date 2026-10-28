import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { changeEmploymentTermsSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Change the current employment's terms: regularize, renew a contract, or change type (ADR-052). */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/employment/terms">) {
  try {
    const id = objectId().parse((await ctx.params).id);
    const input = changeEmploymentTermsSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    const employment = await EmploymentService.changeTerms(
      id,
      input.organizationId,
      { employmentType: input.employmentType, effectiveFrom: input.effectiveFrom, endOfContract: input.endOfContract, note: input.note },
      { userId },
    );
    return NextResponse.json({ employment: { employmentType: employment.employmentType, endOfContract: employment.endOfContract ?? null } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
