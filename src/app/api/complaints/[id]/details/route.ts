import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ComplaintService } from "@/domains/complaints/complaint-service";
import { saveComplaintStageDetailsSchema } from "@/shared/validation/complaint";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Saves one stage's details section (NTE, hearing, sanction, ...) from the side panel. The service checks the fields against the stage. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/complaints/[id]/details">) {
  try {
    const { id } = await ctx.params;
    const input = saveComplaintStageDetailsSchema.parse(await request.json());
    const { userId } = await requirePermission("complaints.update", input.organizationId);
    const complaint = await ComplaintService.saveStageDetails(id, input.organizationId, { stage: input.stage, details: input.details }, { userId });
    return NextResponse.json({ complaint });
  } catch (error) {
    return toErrorResponse(error);
  }
}
