import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ProjectService } from "@/domains/organization/project-service";
import { updateProjectSchema } from "@/shared/validation/organization-structure";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId, status, ...patch } = updateProjectSchema.parse(await request.json());
    const { userId } = await requirePermission("projects.update", organizationId);
    const project = status
      ? await ProjectService.updateStatus(id, organizationId, { status }, { userId })
      : await ProjectService.update(id, organizationId, patch, { userId });
    return NextResponse.json({ project });
  } catch (error) {
    return toErrorResponse(error);
  }
}
