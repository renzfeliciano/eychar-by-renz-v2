import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { JobOpeningService } from "@/domains/recruitment/job-opening-service";
import { createJobOpeningSchema } from "@/shared/validation/recruitment";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("job-openings.read", organizationId);
    const openings = await JobOpeningService.listCurrent(organizationId);
    return NextResponse.json({ openings });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createJobOpeningSchema.parse(await request.json());
    const { userId } = await requirePermission("job-openings.create", input.organizationId);
    const opening = await JobOpeningService.create(input, { userId });
    return NextResponse.json({ opening }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
