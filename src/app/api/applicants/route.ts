import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { createApplicantSchema } from "@/shared/validation/recruitment";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("applicants.read", organizationId);

    const stage = request.nextUrl.searchParams.get("stage") ?? undefined;
    const applicants = await ApplicantService.listForOrganization(organizationId, { stage });

    return NextResponse.json({ applicants });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createApplicantSchema.parse(await request.json());
    const { userId } = await requirePermission("applicants.create", input.organizationId);
    const applicant = await ApplicantService.create(input, { userId });
    return NextResponse.json({ applicant }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
