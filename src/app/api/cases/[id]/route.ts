import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { CaseService } from "@/domains/cases/case-service";
import { updateCaseSchema } from "@/shared/validation/cases";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/cases/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateCaseSchema.parse(await request.json());
    const { userId } = await requirePermission("cases.update", input.organizationId);
    const caseRecord = await CaseService.update(id, input.organizationId, input, { userId });
    return NextResponse.json({ case: caseRecord });
  } catch (error) {
    return toErrorResponse(error);
  }
}
