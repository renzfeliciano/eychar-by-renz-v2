import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { JobOpeningService } from "@/domains/recruitment/job-opening-service";
import { updateJobOpeningStatusSchema } from "@/shared/validation/recruitment";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/job-openings/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateJobOpeningStatusSchema.parse(await request.json());
    const { userId } = await requirePermission("job-openings.update", input.organizationId);
    const opening = await JobOpeningService.updateStatus(id, input.organizationId, input, { userId });
    return NextResponse.json({ opening });
  } catch (error) {
    return toErrorResponse(error);
  }
}
