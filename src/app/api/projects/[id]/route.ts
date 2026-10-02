import { NextResponse } from "next/server";
import { requirePermission, requireProjectAccess } from "@/server/authorization";
import { ProjectService } from "@/domains/organization/project-service";
import { updateProjectSchema } from "@/shared/validation/organization-structure";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId, status, ...patch } = updateProjectSchema.parse(await request.json());
    // Editing a project's details is open to whoever may update this project (organization-wide or
    // project-scoped); opening, closing or deactivating it stays an organization-wide decision.
    const { userId } = status ? await requirePermission("projects.update", organizationId) : await requireProjectAccess("projects.update", organizationId, id);
    const project = status
      ? await ProjectService.updateStatus(id, organizationId, { status }, { userId })
      : await ProjectService.update(id, organizationId, patch, { userId });
    return NextResponse.json({ project });
  } catch (error) {
    return toErrorResponse(error);
  }
}
