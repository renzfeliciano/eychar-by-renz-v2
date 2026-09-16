import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { createOrganizationUnitSchema } from "@/shared/validation/organization-structure";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("organization-units.read", organizationId);
    const units = await OrganizationUnitService.listCurrent(organizationId);
    return NextResponse.json({ units });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createOrganizationUnitSchema.parse(await request.json());
    const { userId } = await requirePermission("organization-units.create", input.organizationId);
    const unit = await OrganizationUnitService.create(input, { userId });
    return NextResponse.json({ unit }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
