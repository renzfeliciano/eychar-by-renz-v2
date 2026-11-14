import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ComplaintService } from "@/domains/complaints/complaint-service";
import { createComplaintSchema } from "@/shared/validation/complaint";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("complaints.read", organizationId);

    const stage = request.nextUrl.searchParams.get("stage") ?? undefined;
    const complaints = await ComplaintService.listForOrganization(organizationId, { stage });

    return NextResponse.json({ complaints });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createComplaintSchema.parse(await request.json());
    const { userId } = await requirePermission("complaints.create", input.organizationId);
    const complaint = await ComplaintService.create(input, { userId });
    return NextResponse.json({ complaint }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
