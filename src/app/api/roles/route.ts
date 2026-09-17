import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { RoleService } from "@/domains/authorization/role-service";
import { createRoleSchema } from "@/shared/validation/roles";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("roles.read", organizationId);
    const [roles, availablePermissions] = await Promise.all([
      RoleService.listCurrent(organizationId),
      RoleService.listAvailablePermissions(),
    ]);
    return NextResponse.json({ roles, availablePermissions });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createRoleSchema.parse(await request.json());
    const { userId } = await requirePermission("roles.create", input.organizationId);
    const role = await RoleService.create(input, { userId });
    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
