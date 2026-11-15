import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/authorization";
import { SeparationTypeService } from "@/domains/catalog/separation-type-service";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

const bodySchema = z.object({
  organizationId: objectId(),
  // An employment status code, or null for "no status" (final pay then skips the check; ADR-062).
  employmentStatusCode: z.string().trim().min(1).max(200).nullable(),
});

/** Sets which employment status a separation type ends in (ADR-062; settings for gaps B26). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/separation-types/[id]/employment-status">) {
  try {
    const { id } = await ctx.params;
    const input = bodySchema.parse(await request.json());
    const { userId } = await requirePermission("separation-types.update", input.organizationId);
    const item = await SeparationTypeService.setEmploymentStatus(id, input.organizationId, input.employmentStatusCode, { userId });
    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error);
  }
}
