import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { PositionService } from "@/domains/organization/position-service";
import { createPositionSchema } from "@/shared/validation/organization-structure";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("positions.read", organizationId);
    const positions = await PositionService.listCurrent(organizationId);
    return NextResponse.json({ positions });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createPositionSchema.parse(await request.json());
    const { userId } = await requirePermission("positions.create", input.organizationId);
    const position = await PositionService.create(input, { userId });
    return NextResponse.json({ position }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
