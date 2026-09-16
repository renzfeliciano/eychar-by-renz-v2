import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ProjectService } from "@/domains/organization/project-service";
import { updateOrganizationEntityStatusSchema } from "@/shared/validation/organization-structure";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateOrganizationEntityStatusSchema.parse(await request.json());
    if (!input.status) throw new Error("status is required");
    const { userId } = await requirePermission("projects.update", input.organizationId);
    const project = await ProjectService.updateStatus(
      id,
      input.organizationId,
      { status: input.status },
      { userId },
    );
    return NextResponse.json({ project });
  } catch (error) {
    return toErrorResponse(error);
  }
}
