import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { createCompensationSchema } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("compensation.read", organizationId);
    const compensationRecords = await CompensationService.listForOrganization(organizationId);
    return NextResponse.json({ compensationRecords });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createCompensationSchema.parse(await request.json());
    const { userId } = await requirePermission("compensation.create", input.organizationId);
    const compensation = await CompensationService.create(input, { userId });
    return NextResponse.json({ compensation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
