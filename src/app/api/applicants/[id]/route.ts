import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { updateApplicantSchema } from "@/shared/validation/recruitment";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/applicants/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateApplicantSchema.parse(await request.json());
    const { userId } = await requirePermission("applicants.update", input.organizationId);
    const applicant = await ApplicantService.update(id, input.organizationId, input, { userId });
    return NextResponse.json({ applicant });
  } catch (error) {
    return toErrorResponse(error);
  }
}
