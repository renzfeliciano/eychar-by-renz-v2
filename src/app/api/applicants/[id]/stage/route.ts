import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { moveApplicantStageSchema } from "@/shared/validation/recruitment";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Distinct from a full update — this is the drag-and-drop/"Move to"-select action, so it gets its own narrow schema and audit action. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/applicants/[id]/stage">) {
  try {
    const { id } = await ctx.params;
    const input = moveApplicantStageSchema.parse(await request.json());
    const { userId } = await requirePermission("applicants.update", input.organizationId);
    const applicant = await ApplicantService.moveStage(id, input.organizationId, { stage: input.stage }, { userId });
    return NextResponse.json({ applicant });
  } catch (error) {
    return toErrorResponse(error);
  }
}
