import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ComplaintService } from "@/domains/complaints/complaint-service";
import { updateComplaintSchema } from "@/shared/validation/complaint";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/complaints/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateComplaintSchema.parse(await request.json());
    const { userId } = await requirePermission("complaints.update", input.organizationId);
    const complaint = await ComplaintService.update(id, input.organizationId, input, { userId });
    return NextResponse.json({ complaint });
  } catch (error) {
    return toErrorResponse(error);
  }
}
