import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ComplaintService } from "@/domains/complaints/complaint-service";
import { moveComplaintStageSchema } from "@/shared/validation/complaint";
import { toErrorResponse } from "@/shared/errors/to-response";

/** The drag-and-drop/"Move to"-select action: its own narrow schema and audit action, distinct from a full edit. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/complaints/[id]/stage">) {
  try {
    const { id } = await ctx.params;
    const input = moveComplaintStageSchema.parse(await request.json());
    const { userId } = await requirePermission("complaints.update", input.organizationId);
    const complaint = await ComplaintService.moveStage(id, input.organizationId, { stage: input.stage, details: input.details }, { userId });
    return NextResponse.json({ complaint });
  } catch (error) {
    return toErrorResponse(error);
  }
}
