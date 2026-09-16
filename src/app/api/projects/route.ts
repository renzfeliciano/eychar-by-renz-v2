import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ProjectService } from "@/domains/organization/project-service";
import { createProjectSchema } from "@/shared/validation/organization-structure";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("projects.read", organizationId);
    const projects = await ProjectService.listCurrent(organizationId);
    return NextResponse.json({ projects });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createProjectSchema.parse(await request.json());
    const { userId } = await requirePermission("projects.create", input.organizationId);
    const project = await ProjectService.create(input, { userId });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
