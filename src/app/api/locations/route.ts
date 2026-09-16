import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LocationService } from "@/domains/organization/location-service";
import { createLocationSchema } from "@/shared/validation/organization-structure";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("locations.read", organizationId);
    const locations = await LocationService.listCurrent(organizationId);
    return NextResponse.json({ locations });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createLocationSchema.parse(await request.json());
    const { userId } = await requirePermission("locations.create", input.organizationId);
    const location = await LocationService.create(input, { userId });
    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
