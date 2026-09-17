import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { assignRoleSchema } from "@/shared/validation/roles";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("roles.read", organizationId);
    const [assignments, members] = await Promise.all([
      RoleAssignmentService.listForOrganization(organizationId),
      RoleAssignmentService.listOrganizationMembers(organizationId),
    ]);
    return NextResponse.json({ assignments, members });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = assignRoleSchema.parse(await request.json());
    const { userId } = await requirePermission("roles.assign", input.organizationId);
    const assignment = await RoleAssignmentService.assign(input, { userId });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
