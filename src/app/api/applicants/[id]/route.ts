import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { decideApplicantSchema } from "@/shared/validation/recruitment";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/applicants/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = decideApplicantSchema.parse(await request.json());

    if (input.action === "advance") {
      const { userId } = await requirePermission("applicants.update", input.organizationId);
      const applicant = await ApplicantService.advanceStage(id, input.organizationId, { stage: input.stage }, { userId });
      return NextResponse.json({ applicant });
    }

    if (input.action === "reject") {
      const { userId } = await requirePermission("applicants.update", input.organizationId);
      const applicant = await ApplicantService.reject(id, input.organizationId, { reason: input.reason }, { userId });
      return NextResponse.json({ applicant });
    }

    const { userId } = await requirePermission("applicants.hire", input.organizationId);
    const applicant = await ApplicantService.hire(
      id,
      input.organizationId,
      {
        employeeNumber: input.employeeNumber,
        employmentType: input.employmentType,
        positionId: input.positionId,
        organizationUnitId: input.organizationUnitId,
        projectId: input.projectId,
        locationId: input.locationId,
        reportsToEmployeeId: input.reportsToEmployeeId,
        effectiveFrom: input.effectiveFrom,
      },
      { userId },
    );
    return NextResponse.json({ applicant });
  } catch (error) {
    return toErrorResponse(error);
  }
}
