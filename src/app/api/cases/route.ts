import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { CaseService } from "@/domains/cases/case-service";
import { createCaseSchema } from "@/shared/validation/cases";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("cases.read", organizationId);
    const cases = await CaseService.listCurrent(organizationId);
    return NextResponse.json({ cases });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createCaseSchema.parse(await request.json());
    const { userId } = await requirePermission("cases.create", input.organizationId);
    const caseRecord = await CaseService.create(input, { userId });
    return NextResponse.json({ case: caseRecord }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
